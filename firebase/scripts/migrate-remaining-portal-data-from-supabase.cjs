/**
 * Import remaining portal data from Supabase → Firestore.
 *
 * Tables: recipes, recipe_uom_profiles, recipe_uom_chain_steps,
 *   item_warehouse_handling_policies, scanners, pos_item_map, operators
 *   warehouse_live_items (via list_warehouse_items RPC per warehouse)
 *
 * Excludes Orders App data (transfer_orders, outlet_order_catalog, app_users).
 *
 * Run from firebase folder:
 *   node scripts/migrate-remaining-portal-data-from-supabase.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
const {
  KEY_PATH,
  getSupabaseConfig,
  fetchAllRows,
  commitBatches,
} = require("./lib/migrate-supabase-utils.cjs");

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function variantKey(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || "base";
}

function stockDocId(warehouseId, itemId, variantKeyValue) {
  return `${warehouseId}__${itemId}__${variantKey(variantKeyValue)}`;
}

function isSupervisorUser(user) {
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  if (typeof role === "string" && role.trim().toLowerCase() === "supervisor") return true;
  const roles = user.app_metadata?.roles ?? user.user_metadata?.roles;
  if (Array.isArray(roles)) {
    return roles.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === "supervisor");
  }
  return false;
}

async function fetchSupabaseAuthUsers(supabase) {
  const users = [];
  let page = 1;
  while (true) {
    const response = await fetch(`${supabase.url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      console.warn(`  Skipping auth users: ${response.status} ${body}`);
      return [];
    }
    const data = await response.json();
    const batch = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];
    if (!batch.length) break;
    users.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

async function fetchWarehouseItemsRpc(supabase, warehouseId) {
  const response = await fetch(`${supabase.url}/rest/v1/rpc/list_warehouse_items`, {
    method: "POST",
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_warehouse_id: warehouseId,
      p_outlet_id: null,
      p_search: null,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 404 || body.includes("PGRST202")) {
      return [];
    }
    throw new Error(`list_warehouse_items failed for ${warehouseId}: ${body}`);
  }
  return response.json();
}

async function main() {
  const supabase = getSupabaseConfig();
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const migratedAt = new Date().toISOString();

  console.log(DRY_RUN ? "DRY RUN" : "Migrating remaining portal data → Firestore...");
  console.log(`Supabase: ${supabase.url}\n`);

  const recipes = await fetchAllRows(supabase, "recipes", { order: "finished_item_id", optional: true });
  await commitBatches(
    db,
    "recipes",
    recipes.map((row, index) => ({
      id: row.id || `${row.finished_item_id}_${row.ingredient_item_id}_${index}`,
      data: { ...row, migratedAt },
    })),
    "recipes",
    DRY_RUN,
  );

  const uomProfiles = await fetchAllRows(supabase, "recipe_uom_profiles", { order: "item_id", optional: true });
  await commitBatches(
    db,
    "recipe_uom_profiles",
    uomProfiles.map((row) => ({
      id: row.id,
      data: { ...row, migratedAt },
    })),
    "recipe_uom_profiles",
    DRY_RUN,
  );

  const profileIds = uomProfiles.map((row) => row.id).filter(Boolean);
  let uomSteps = [];
  for (let i = 0; i < profileIds.length; i += 100) {
    const chunk = profileIds.slice(i, i + 100);
    const filter = `&profile_id=in.(${chunk.map((id) => `"${id}"`).join(",")})`;
    const batch = await fetchAllRows(supabase, "recipe_uom_chain_steps", {
      order: "step_order",
      filter,
      optional: true,
    });
    uomSteps = uomSteps.concat(batch);
  }
  await commitBatches(
    db,
    "recipe_uom_chain_steps",
    uomSteps.map((row, index) => ({
      id: row.id || `${row.profile_id}_${row.step_order ?? index}`,
      data: { ...row, migratedAt },
    })),
    "recipe_uom_chain_steps",
    DRY_RUN,
  );

  const handlingPolicies = await fetchAllRows(supabase, "item_warehouse_handling_policies", {
    order: "item_id",
    optional: true,
  });
  await commitBatches(
    db,
    "item_warehouse_handling_policies",
    handlingPolicies.map((row, index) => ({
      id: row.id || `${row.item_id}_${row.warehouse_id}_${index}`,
      data: { ...row, migratedAt },
    })),
    "item_warehouse_handling_policies",
    DRY_RUN,
  );

  const scanners = await fetchAllRows(supabase, "scanners", { order: "name", optional: true });
  await commitBatches(
    db,
    "scanners",
    scanners.map((row) => ({
      id: row.id,
      data: { ...row, migratedAt },
    })),
    "scanners",
    DRY_RUN,
  );

  const posItemMap = await fetchAllRows(supabase, "pos_item_map", { order: "pos_item_id", optional: true });
  await commitBatches(
    db,
    "pos_item_map",
    posItemMap.map((row, index) => {
      const id = [
        row.outlet_id,
        row.pos_item_id,
        row.pos_flavour_id || "none",
        row.catalog_item_id,
        variantKey(row.catalog_variant_key || row.normalized_variant_key),
        row.warehouse_id || "none",
      ].join("__");
      return {
        id: id || `map_${index}`,
        data: {
          ...row,
          normalized_variant_key: variantKey(row.catalog_variant_key || row.normalized_variant_key),
          migratedAt,
        },
      };
    }),
    "pos_item_map",
    DRY_RUN,
  );

  const authUsers = await fetchSupabaseAuthUsers(supabase);
  const operators = authUsers
    .filter((user) => !user.is_anonymous && isSupervisorUser(user))
    .map((user) => ({
      id: user.id,
      data: {
        userId: user.id,
        displayName:
          (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()) ||
          user.email ||
          "Operator",
        email: user.email ?? null,
        authUserId: user.id,
        migratedAt,
      },
    }));
  await commitBatches(db, "operators", operators, "operators", DRY_RUN);

  const warehouses = await fetchAllRows(supabase, "warehouses", { order: "name", optional: true });
  const stockRows = [];
  for (const warehouse of warehouses) {
    if (!warehouse.id) continue;
    const items = await fetchWarehouseItemsRpc(supabase, warehouse.id);
    for (const row of items) {
      if (!row.item_id) continue;
      stockRows.push({
        id: stockDocId(warehouse.id, row.item_id, row.variant_key),
        data: {
          warehouseId: warehouse.id,
          warehouse_id: warehouse.id,
          itemId: row.item_id,
          item_id: row.item_id,
          itemName: row.item_name ?? null,
          item_name: row.item_name ?? null,
          variantKey: variantKey(row.variant_key),
          variant_key: variantKey(row.variant_key),
          netUnits: Number(row.net_units ?? 0),
          net_units: Number(row.net_units ?? 0),
          itemKind: row.item_kind ?? null,
          item_kind: row.item_kind ?? null,
          migratedAt,
        },
      });
    }
    console.log(`  warehouse ${warehouse.name ?? warehouse.id}: ${items.length} live items`);
  }
  await commitBatches(db, "warehouse_live_items", stockRows, "warehouse_live_items", DRY_RUN);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
