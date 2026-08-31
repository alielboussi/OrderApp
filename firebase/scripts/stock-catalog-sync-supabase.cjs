/**
 * Sync brother stock catalog API → Supabase catalog_items + warehouses.
 * All imported/updated products are forced to item_kind = ingredient.
 *
 *   node firebase/scripts/stock-catalog-sync-supabase.cjs
 *   node firebase/scripts/stock-catalog-sync-supabase.cjs --dry-run
 */
const { loadEnv, createSupabaseAdmin } = require("./lib/supabase-client.cjs");

const DEFAULT_STOCK_CATALOG_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";

const ITEM_KIND = "ingredient";
const BATCH_SIZE = 100;

function nowIso() {
  return new Date().toISOString();
}

function cleanUnitName(value, fallback = "each") {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

function normalizeWarehouseName(value) {
  return String(value ?? "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function mapProductUnits(product) {
  const storageUnit = cleanUnitName(product.subUnit?.name, "each");
  const purchaseUnit = cleanUnitName(product.unit?.name, storageUnit);
  const unitsPerPurchasePack = Number(product.subUnit?.perUnit ?? 1);
  return {
    storage_unit: storageUnit,
    purchase_pack_unit: purchaseUnit,
    units_per_purchase_pack:
      Number.isFinite(unitsPerPurchasePack) && unitsPerPurchasePack > 0 ? unitsPerPurchasePack : 1,
    transfer_unit: storageUnit,
    transfer_quantity: 1,
    consumption_unit: storageUnit,
    consumption_uom: storageUnit,
  };
}

async function fetchStockCatalog(token) {
  const url = process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Stock catalog API returned ${response.status}`);
  }
  return response.json();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim(),
  );
}

async function upsertWarehouses(supabase, apiWarehouses, dryRun) {
  const rows = [];
  const now = nowIso();

  for (const warehouse of apiWarehouses ?? []) {
    const id = String(warehouse.uuid ?? "").trim();
    const name = String(warehouse.name ?? "").trim().replace(/^"+|"+$/g, "") || "Warehouse";
    if (!isUuid(id)) continue;
    rows.push({
      id,
      name,
      code: normalizeWarehouseName(name).replace(/\s+/g, "_").slice(0, 32) || null,
      active: warehouse.active !== false,
      warehouse_scope: "hub",
      updated_at: now,
      created_at: now,
    });
  }

  if (!rows.length) return 0;
  if (dryRun) return rows.length;

  const { error } = await supabase.from("warehouses").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`warehouse upsert failed: ${error.message}`);
  return rows.length;
}

function buildCatalogRow(product, now) {
  const id = String(product.uuid ?? "").trim();
  const units = mapProductUnits(product);
  return {
    id,
    name: String(product.name ?? "").trim() || "Unnamed product",
    item_kind: ITEM_KIND,
    sku: null,
    supplier_sku: null,
    cost: 0,
    selling_price: 0,
    has_variations: false,
    has_recipe: false,
    outlet_order_visible: true,
    image_url: null,
    menu_group_id: null,
    active: true,
    ...units,
    updated_at: now,
    created_at: now,
  };
}

async function upsertCatalogItems(supabase, products, dryRun) {
  const now = nowIso();
  const rows = [];
  let skippedInvalidUuid = 0;

  for (const product of products ?? []) {
    const id = String(product.uuid ?? "").trim();
    if (!isUuid(id)) {
      skippedInvalidUuid += 1;
      continue;
    }
    rows.push(buildCatalogRow(product, now));
  }

  if (!rows.length) {
    return { upserted: 0, skippedInvalidUuid };
  }

  if (dryRun) {
    return { upserted: rows.length, skippedInvalidUuid };
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("catalog_items").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`catalog_items upsert failed: ${error.message}`);
    upserted += chunk.length;
  }

  // Force item_kind on any existing rows matched by id (upsert already sets it for new+updated).
  const ids = rows.map((row) => row.id);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("catalog_items")
      .update({ item_kind: ITEM_KIND, updated_at: now })
      .in("id", chunk);
    if (error) throw new Error(`catalog_items item_kind update failed: ${error.message}`);
  }

  return { upserted, skippedInvalidUuid };
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const token =
    process.env.STOCK_SYNC_API_TOKEN?.trim() || process.env.Afterten_Purchases_Api_Token?.trim();
  if (!token) {
    throw new Error(
      "STOCK_SYNC_API_TOKEN (or Afterten_Purchases_Api_Token) is required in afterten-website-portal/.env.local",
    );
  }

  const catalog = await fetchStockCatalog(token);
  const products = catalog.products ?? [];
  const supabase = createSupabaseAdmin();

  const warehousesUpserted = await upsertWarehouses(supabase, catalog.warehouses ?? [], dryRun);
  const { upserted, skippedInvalidUuid } = await upsertCatalogItems(supabase, products, dryRun);

  const { count: catalogCount, error: countError } = await supabase
    .from("catalog_items")
    .select("*", { count: "exact", head: true })
    .eq("item_kind", ITEM_KIND);
  if (countError && !dryRun) {
    throw new Error(`post-sync count failed: ${countError.message}`);
  }

  const report = {
    ok: true,
    dry_run: dryRun,
    generated_at: nowIso(),
    catalog_generated_at: catalog.generatedAt ?? null,
    summary: {
      api_products: products.length,
      warehouses_upserted: warehousesUpserted,
      catalog_items_upserted: upserted,
      skipped_invalid_uuid: skippedInvalidUuid,
      catalog_items_ingredient_total: dryRun ? null : catalogCount ?? 0,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
