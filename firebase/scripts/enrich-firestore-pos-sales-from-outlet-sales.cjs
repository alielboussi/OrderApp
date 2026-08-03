/**
 * Backfill rawPayload.items on Firestore POS bills from Supabase outlet_sales rows.
 * Use when orders.raw_payload had no items array (legacy Supabase sync).
 *
 *   node scripts/enrich-firestore-pos-sales-from-outlet-sales.cjs
 *   OUTLET_ID=a406fede-7aab-4473-8e9f-ff645267466f node scripts/enrich-firestore-pos-sales-from-outlet-sales.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
const { KEY_PATH, getSupabaseConfig, fetchAllRows } = require("./lib/migrate-supabase-utils.cjs");

const OUTLETS = {
  quick_corner: "a406fede-7aab-4473-8e9f-ff645267466f",
  till1: "648e949d-8648-4c43-80d4-f08feb7bdd04",
  till2: "a655b0a1-a37a-43d6-aa55-7f97377b2660",
};

const outletId = (process.env.OUTLET_ID || OUTLETS.quick_corner).trim().toLowerCase();
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function asText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildItemFromOutletSale(row, catalogItems, catalogVariants) {
  const context = row.context && typeof row.context === "object" ? row.context : {};
  const item = catalogItems.get(row.item_id);
  const variantKey = asText(row.variant_key);
  const flavourId = asText(row.flavour_id);
  const variantLookup = variantKey && variantKey.toLowerCase() !== "base" ? variantKey : flavourId;
  const variant =
    catalogVariants.get(`${row.item_id}::${variantLookup}`) ??
    catalogVariants.get(`${row.item_id}::${row.item_id}`);

  return {
    pos_item_id: asText(context.pos_item_id) ?? flavourId ?? variantLookup ?? row.id,
    name: item?.name ?? null,
    item_sku: item?.sku ?? null,
    variant_sku: variant?.sku ?? variantLookup,
    flavour_name: variant?.name ?? null,
    quantity: toNumber(row.qty_units),
    sale_price: toNumber(row.sale_price),
    vat_exc_price: toNumber(row.vat_exc_price),
    flavour_price: toNumber(row.flavour_price),
    flavour_id: flavourId,
    modifier_id: asText(context.modifier_id),
  };
}

async function main() {
  const supabase = getSupabaseConfig();
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(DRY_RUN ? "=== DRY RUN: enrich POS sales ===" : "=== Enrich POS sales from outlet_sales ===");
  console.log(`Outlet: ${outletId}\n`);

  const salesRows = await fetchAllRows(supabase, "outlet_sales", {
    select: "id,outlet_id,item_id,variant_key,flavour_id,qty_units,sale_price,vat_exc_price,flavour_price,context,sold_at",
    order: "sold_at",
    filter: `&outlet_id=eq.${outletId}`,
  });

  const itemIds = [...new Set(salesRows.map((r) => r.item_id).filter(Boolean))];
  const catalogItems = new Map();
  const catalogVariants = new Map();

  for (let i = 0; i < itemIds.length; i += 100) {
    const chunk = itemIds.slice(i, i + 100);
    const inList = chunk.map((id) => `"${id}"`).join(",");
    const items = await fetchAllRows(supabase, "catalog_items", {
      select: "id,name,sku",
      filter: `&id=in.(${inList})`,
      optional: true,
    });
    items.forEach((row) => catalogItems.set(row.id, row));

    const variants = await fetchAllRows(supabase, "catalog_variants", {
      select: "id,item_id,name,sku",
      filter: `&item_id=in.(${inList})`,
      optional: true,
    });
    variants.forEach((row) => {
      catalogVariants.set(`${row.item_id}::${row.id}`, row);
      if (row.sku) catalogVariants.set(`${row.item_id}::${row.sku}`, row);
    });
  }

  const bySource = new Map();
  for (const row of salesRows) {
    const context = row.context && typeof row.context === "object" ? row.context : {};
    const sourceEventId = asText(context.source_event_id);
    if (!sourceEventId) continue;
    if (!bySource.has(sourceEventId)) bySource.set(sourceEventId, []);
    bySource.get(sourceEventId).push(buildItemFromOutletSale(row, catalogItems, catalogVariants));
  }

  console.log(`outlet_sales rows: ${salesRows.length}`);
  console.log(`bills with lines:  ${bySource.size}\n`);

  let updated = 0;
  const bulkWriter = db.bulkWriter();
  bulkWriter.onWriteError((error) => (error.failedAttempts < 8 ? true : (console.error(error.message), false)));

  let i = 0;
  for (const [sourceEventId, items] of bySource.entries()) {
    i += 1;
    if (DRY_RUN) {
      updated += 1;
      continue;
    }

    const billRef = db.collection("pos_sales").doc(outletId).collection("bills").doc(sourceEventId);
    bulkWriter.update(billRef, {
      itemCount: items.length,
      hasOutletSales: items.length > 0,
      "rawPayload.items": items,
    });

    for (const item of items) {
      const lineId = asText(item.pos_item_id) || `${sourceEventId}-${Math.random().toString(36).slice(2, 8)}`;
      bulkWriter.set(
        billRef.collection("lines").doc(String(lineId)),
        {
          posItemId: String(item.pos_item_id ?? ""),
          name: item.name ?? "",
          itemSku: item.item_sku ?? "",
          variantSku: item.variant_sku ?? "",
          flavourName: item.flavour_name ?? "",
          quantity: item.quantity,
          salePrice: item.sale_price,
          vatExclusivePrice: item.vat_exc_price,
          flavourPrice: item.flavour_price,
          flavourId: item.flavour_id ?? "",
          modifierId: item.modifier_id ?? "",
        },
        { merge: true },
      );
    }

    updated += 1;
    if (i % 1000 === 0) console.log(`  enriched ${i}/${bySource.size}...`);
  }

  if (!DRY_RUN) await bulkWriter.close();

  console.log(`\nEnriched: ${updated} bills`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
