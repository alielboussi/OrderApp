/**
 * Import MintPOS finished products + variants → Supabase catalog.
 *
 * Sources:
 *   - Live MintPOS SQL (default): MINTPOS_DB_* env or --appsettings C:\ProgramData\SCPGT\appsettings.json
 *   - Offline JSON export: --from-json path/to/mintpos-catalog.json
 *
 *   node firebase/scripts/mintpos-catalog-import-supabase.cjs
 *   node firebase/scripts/mintpos-catalog-import-supabase.cjs --dry-run
 *   node firebase/scripts/mintpos-catalog-import-supabase.cjs --from-json exports/mintpos/catalog.json
 */
const { randomUUID } = require("crypto");
const { resolve } = require("path");
const { writeFileSync, mkdirSync } = require("fs");
const { dirname } = require("path");
const { createSupabaseAdmin } = require("./lib/supabase-client.cjs");
const {
  loadMintPosCatalogFromJson,
  readMintPosCatalog,
} = require("./lib/mintpos-db.cjs");

const ITEM_KIND = "finished";
const BATCH_SIZE = 100;

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    fromJson: null,
    appsettingsPath: null,
    exportJson: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--from-json") {
      args.fromJson = resolve(process.cwd(), argv[++i]);
    } else if (arg === "--appsettings") {
      args.appsettingsPath = resolve(process.cwd(), argv[++i]);
    } else if (arg === "--export-json") {
      args.exportJson = resolve(process.cwd(), argv[++i]);
    }
  }
  return args;
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildVariantId(itemSku, variantSku) {
  return `pos-${itemSku}__${variantSku}`;
}

async function loadExistingFinishedCatalog(supabase) {
  const [itemsRes, variantsRes, groupsRes] = await Promise.all([
    supabase.from("catalog_items").select("id,sku,name,menu_group_id").eq("item_kind", ITEM_KIND),
    supabase.from("catalog_variants").select("id,item_id,sku,name").eq("item_kind", ITEM_KIND),
    supabase.from("catalog_menu_groups").select("id,pos_menu_group_id,name"),
  ]);

  if (itemsRes.error) throw new Error(`catalog_items read failed: ${itemsRes.error.message}`);
  if (variantsRes.error) throw new Error(`catalog_variants read failed: ${variantsRes.error.message}`);
  if (groupsRes.error) throw new Error(`catalog_menu_groups read failed: ${groupsRes.error.message}`);

  const itemsBySku = new Map();
  for (const row of itemsRes.data ?? []) {
    const sku = String(row.sku ?? "").trim();
    if (sku) itemsBySku.set(sku, row);
  }

  const variantsByItemAndSku = new Map();
  const variantsByItemAndName = new Map();
  const variantsById = new Map();
  for (const row of variantsRes.data ?? []) {
    variantsById.set(row.id, row);
    const skuKey = `${row.item_id}::${String(row.sku ?? "").trim().toLowerCase()}`;
    variantsByItemAndSku.set(skuKey, row);
    const nameKey = `${row.item_id}::${normalizeName(row.name)}`;
    variantsByItemAndName.set(nameKey, row);
  }

  const groupsByPosId = new Map();
  const groupsByName = new Map();
  for (const row of groupsRes.data ?? []) {
    if (row.pos_menu_group_id != null) groupsByPosId.set(Number(row.pos_menu_group_id), row);
    groupsByName.set(normalizeName(row.name), row);
  }

  return { itemsBySku, variantsByItemAndSku, variantsByItemAndName, variantsById, groupsByPosId, groupsByName };
}

async function upsertMenuGroups(supabase, menuGroups, existing, dryRun) {
  let upserted = 0;
  const groupIdByPosId = new Map();

  for (const group of menuGroups) {
    const posId = Number(group.pos_menu_group_id);
    const name = String(group.group_name ?? "").trim();
    if (!Number.isFinite(posId) || posId <= 0 || !name) continue;

    const existingGroup =
      existing.groupsByPosId.get(posId) ?? existing.groupsByName.get(normalizeName(name));
    const row = {
      name,
      pos_menu_group_id: posId,
      active: true,
      updated_at: nowIso(),
      ...(existingGroup ? { id: existingGroup.id } : {}),
    };

    if (existingGroup) {
      groupIdByPosId.set(posId, existingGroup.id);
      if (!dryRun) {
        const { error } = await supabase.from("catalog_menu_groups").update(row).eq("id", existingGroup.id);
        if (error) throw new Error(`menu group update failed (${name}): ${error.message}`);
      }
      upserted += 1;
      continue;
    }

    const id = randomUUID();
    groupIdByPosId.set(posId, id);
    if (!dryRun) {
      const { error } = await supabase.from("catalog_menu_groups").insert({
        id,
        name,
        pos_menu_group_id: posId,
        active: true,
        sort_order: posId,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      if (error) throw new Error(`menu group insert failed (${name}): ${error.message}`);
    }
    upserted += 1;
  }

  return { upserted, groupIdByPosId };
}

async function upsertCatalog(supabase, catalogRows, groupIdByPosId, existing, dryRun) {
  const itemRows = [];
  const variantRows = [];
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;
  let skippedNoMenuGroup = 0;
  let menuGroupsAutoCreated = 0;

  for (const item of catalogRows) {
    const posMenuGroupId = Number(item.pos_menu_group_id);
    let menuGroupId = Number.isFinite(posMenuGroupId) ? groupIdByPosId.get(posMenuGroupId) ?? null : null;

    if (!menuGroupId && Number.isFinite(posMenuGroupId) && posMenuGroupId > 0) {
      menuGroupId = randomUUID();
      groupIdByPosId.set(posMenuGroupId, menuGroupId);
      if (!dryRun) {
        const { error } = await supabase.from("catalog_menu_groups").insert({
          id: menuGroupId,
          name: `Group ${posMenuGroupId}`,
          pos_menu_group_id: posMenuGroupId,
          active: true,
          sort_order: posMenuGroupId,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
        if (error) throw new Error(`auto menu group insert failed (${posMenuGroupId}): ${error.message}`);
      }
      menuGroupsAutoCreated += 1;
    }

    if (!menuGroupId) {
      skippedNoMenuGroup += 1;
      continue;
    }

    const existingItem = existing.itemsBySku.get(item.item_sku);
    const itemId = existingItem?.id ?? randomUUID();
    const hasVariations =
      item.variants.length > 1 ||
      item.variants.some(
        (variant) =>
          normalizeName(variant.variant_name) !== normalizeName(item.item_name) &&
          variant.variant_sku !== item.item_sku,
      );

    const itemRow = {
      id: itemId,
      name: item.item_name,
      sku: item.item_sku,
      item_kind: ITEM_KIND,
      selling_price: item.selling_price,
      menu_group_id: menuGroupId,
      active: true,
      has_variations: hasVariations,
      outlet_order_visible: true,
      consumption_uom: "each",
      consumption_unit: "each",
      purchase_pack_unit: "each",
      transfer_unit: "each",
      transfer_quantity: 1,
      units_per_purchase_pack: 1,
      cost: 0,
      updated_at: nowIso(),
    };

    if (existingItem) itemsUpdated += 1;
    else {
      itemRow.created_at = nowIso();
      itemsCreated += 1;
    }
    itemRows.push(itemRow);

    for (const variant of item.variants) {
      const variantIdCandidate = buildVariantId(item.item_sku, variant.variant_sku);

      const existingVariant =
        existing.variantsByItemAndSku.get(`${itemId}::${variant.variant_sku.toLowerCase()}`) ??
        existing.variantsByItemAndName.get(`${itemId}::${normalizeName(variant.variant_name)}`) ??
        (existing.variantsById.has(variantIdCandidate) ? existing.variantsById.get(variantIdCandidate) : null);

      const variantId = existingVariant?.id ?? variantIdCandidate;
      const variantRow = {
        id: variantId,
        item_id: itemId,
        name: variant.variant_name,
        sku: variant.variant_sku,
        item_kind: ITEM_KIND,
        selling_price: variant.selling_price,
        active: true,
        outlet_order_visible: true,
        consumption_uom: "each",
        purchase_pack_unit: "each",
        transfer_unit: "each",
        transfer_quantity: 1,
        units_per_purchase_pack: 1,
        cost: 0,
        updated_at: nowIso(),
      };

      if (existingVariant) variantsUpdated += 1;
      else {
        variantRow.created_at = nowIso();
        variantsCreated += 1;
      }
      variantRows.push(variantRow);
    }
  }

  if (!dryRun) {
    for (let i = 0; i < itemRows.length; i += BATCH_SIZE) {
      const batch = itemRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("catalog_items").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(`catalog_items upsert failed: ${error.message}`);
    }

    for (let i = 0; i < variantRows.length; i += BATCH_SIZE) {
      const batch = variantRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("catalog_variants").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(`catalog_variants upsert failed: ${error.message}`);
    }
  }

  return {
    items_total: itemRows.length,
    items_created: itemsCreated,
    items_updated: itemsUpdated,
    variants_total: variantRows.length,
    variants_created: variantsCreated,
    variants_updated: variantsUpdated,
    skipped_no_menu_group: skippedNoMenuGroup,
    menu_groups_auto_created: menuGroupsAutoCreated,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.exportJson) {
    const source = await readMintPosCatalog({ appsettingsPath: args.appsettingsPath });
    mkdirSync(dirname(args.exportJson), { recursive: true });
    writeFileSync(args.exportJson, JSON.stringify(source, null, 2), "utf8");
    console.log(
      JSON.stringify(
        {
          ok: true,
          exported_to: args.exportJson,
          menu_groups: source.menu_groups.length,
          catalog_items: source.catalog_rows.length,
          variant_rows: source.catalog_rows.reduce((sum, item) => sum + item.variants.length, 0),
        },
        null,
        2,
      ),
    );
    return;
  }

  const supabase = createSupabaseAdmin();

  const source = args.fromJson
    ? loadMintPosCatalogFromJson(args.fromJson)
    : await readMintPosCatalog({ appsettingsPath: args.appsettingsPath });

  const existing = await loadExistingFinishedCatalog(supabase);
  const { upserted: menuGroupsUpserted, groupIdByPosId } = await upsertMenuGroups(
    supabase,
    source.menu_groups,
    existing,
    args.dryRun,
  );

  const catalogSummary = await upsertCatalog(
    supabase,
    source.catalog_rows,
    groupIdByPosId,
    existing,
    args.dryRun,
  );

  const { count: finishedCount } = await supabase
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("item_kind", ITEM_KIND);
  const { count: variantCount } = await supabase
    .from("catalog_variants")
    .select("id", { count: "exact", head: true })
    .eq("item_kind", ITEM_KIND);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: args.dryRun,
        source: args.fromJson ? { type: "json", path: args.fromJson } : { type: "mintpos_sql" },
        summary: {
          menu_groups_source: source.menu_groups.length,
          menu_groups_upserted: menuGroupsUpserted,
          catalog_items_source: source.catalog_rows.length,
          ...catalogSummary,
          catalog_items_finished_total: args.dryRun ? null : finishedCount ?? 0,
          catalog_variants_finished_total: args.dryRun ? null : variantCount ?? 0,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
