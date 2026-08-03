/**
 * Migrate POS middleware sales from Supabase orders → Firestore pos_sales/{outletId}/bills.
 *
 * Run from firebase/ folder:
 *   node scripts/migrate-pos-sales-from-supabase.cjs
 *   OUTLET_ID=a406fede-7aab-4473-8e9f-ff645267466f node scripts/migrate-pos-sales-from-supabase.cjs
 *   DRY_RUN=1 OUTLET_ID=... node scripts/migrate-pos-sales-from-supabase.cjs
 *
 * Env:
 *   OUTLET_ID          — required outlet UUID (Quick Corner, Till 1, Till 2, …)
 *   SALES_DAYS         — optional; only orders with occurred_at in last N days
 *   DRY_RUN=1          — count only, no writes
 *   SKIP_EXISTING=1    — skip bills already in Firestore (default 1)
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
const {
  KEY_PATH,
  getSupabaseConfig,
  fetchAllRows,
} = require("./lib/migrate-supabase-utils.cjs");

const OUTLETS = {
  till1: "648e949d-8648-4c43-80d4-f08feb7bdd04",
  till2: "a655b0a1-a37a-43d6-aa55-7f97377b2660",
  quick_corner: "a406fede-7aab-4473-8e9f-ff645267466f",
};

const OUTLET_ID = (process.env.OUTLET_ID || OUTLETS.quick_corner).trim().toLowerCase();
const SALES_DAYS = process.env.SALES_DAYS ? Number(process.env.SALES_DAYS) : null;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const SKIP_EXISTING = process.env.SKIP_EXISTING !== "0";

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseDate(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function extractPosBillId(sourceEventId, outletId) {
  const prefix = `${outletId}-`;
  if (sourceEventId.startsWith(prefix)) return sourceEventId.slice(prefix.length);
  return null;
}

function buildLineDocument(item) {
  const row = asRecord(item) ?? {};
  return {
    posItemId: asText(row.pos_item_id) ?? "",
    name: asText(row.name) ?? "",
    itemSku: asText(row.item_sku) ?? "",
    variantSku: asText(row.variant_sku) ?? "",
    flavourName: asText(row.flavour_name) ?? "",
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unit_price ?? row.sale_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    vatExclusivePrice: Number(row.vat_exc_price) || 0,
    flavourPrice: Number(row.flavour_price) || 0,
    discount: Number(row.discount) || 0,
    tax: Number(row.tax) || 0,
    flavourId: asText(row.flavour_id) ?? "",
    modifierId: asText(row.modifier_id) ?? "",
    variantId: asText(row.variant_id) ?? "",
    variantKey: asText(row.variant_key) ?? "",
  };
}

async function main() {
  const outletId = OUTLET_ID;
  if (!/^[0-9a-f-]{36}$/.test(outletId)) {
    console.error("OUTLET_ID must be a UUID. Examples:");
    console.error(`  OUTLET_ID=${OUTLETS.quick_corner} node scripts/migrate-pos-sales-from-supabase.cjs`);
    process.exit(1);
  }

  const supabase = getSupabaseConfig();
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const filter = `&outlet_id=eq.${outletId}&source_event_id=not.is.null`;
  console.log(DRY_RUN ? "=== DRY RUN: POS sales migration ===" : "=== POS sales migration ===");
  console.log(`Outlet:   ${outletId}`);
  console.log(`Supabase: ${supabase.url}`);
  if (SALES_DAYS) console.log(`Window:   last ${SALES_DAYS} days`);
  console.log("");

  const orders = await fetchAllRows(supabase, "orders", {
    select: "source_event_id,pos_sale_id,raw_payload,created_at",
    order: "created_at",
    filter,
  });

  const minDate =
    SALES_DAYS && Number.isFinite(SALES_DAYS) && SALES_DAYS > 0
      ? new Date(Date.now() - SALES_DAYS * 24 * 60 * 60 * 1000)
      : null;

  const candidates = orders.filter((row) => {
    const sourceEventId = asText(row.source_event_id);
    if (!sourceEventId) return false;
    if (!sourceEventId.toLowerCase().startsWith(`${outletId}-`)) return false;
    if (!minDate) return true;
    const raw = asRecord(row.raw_payload);
    const occurred = parseDate(raw?.occurred_at) ?? parseDate(row.created_at);
    return occurred && occurred >= minDate;
  });

  console.log(`Supabase POS orders: ${candidates.length}`);

  let written = 0;
  let skipped = 0;
  let noLines = 0;
  const bulkWriter = db.bulkWriter();
  bulkWriter.onWriteError((error) => {
    if (error.failedAttempts < 8) return true;
    console.error("Write failed:", error.message);
    return false;
  });

  const CHUNK = 100;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const existing = new Set();

    if (SKIP_EXISTING) {
      const refs = chunk.map((row) =>
        db.collection("pos_sales").doc(outletId).collection("bills").doc(row.source_event_id),
      );
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap) => {
        if (snap.exists) existing.add(snap.id.toLowerCase());
      });
    }

    for (const row of chunk) {
      const sourceEventId = asText(row.source_event_id);
      if (!sourceEventId) continue;
      if (existing.has(sourceEventId.toLowerCase())) {
        skipped += 1;
        continue;
      }

      const rawPayload = asRecord(row.raw_payload) ?? {};
      const items = Array.isArray(rawPayload.items) ? rawPayload.items : [];
      const occurredAt =
        parseDate(rawPayload.occurred_at) ?? parseDate(row.created_at) ?? new Date();
      const posOrderId =
        extractPosBillId(sourceEventId, outletId) ?? asText(rawPayload.pos_order_id) ?? "";
      const saleId = asText(row.pos_sale_id) ?? asText(rawPayload.sale_id) ?? "";
      const shift = asRecord(rawPayload.shift);
      const shiftId = shift?.shift_id != null ? Number(shift.shift_id) : null;

      if (items.length === 0) noLines += 1;

      if (DRY_RUN) {
        written += 1;
        continue;
      }

      const billRef = db.collection("pos_sales").doc(outletId).collection("bills").doc(sourceEventId);
      const billData = {
        outletId,
        sourceEventId,
        saleId,
        posOrderId,
        occurredAt: admin.firestore.Timestamp.fromDate(occurredAt),
        status: "synced",
        rawPayload,
        itemCount: items.length,
        hasOutletSales: items.length > 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedFromSupabaseAt: new Date().toISOString(),
      };

      if (shiftId != null && Number.isFinite(shiftId)) {
        billData.shiftId = shiftId;
      }
      const terminal = asText(shift?.terminal) ?? asText(rawPayload.terminal);
      if (terminal) billData.terminalId = terminal;

      bulkWriter.set(billRef, billData, { merge: true });

      for (const item of items) {
        const line = buildLineDocument(item);
        const lineId = asText(line.posItemId) || `${written}-${Math.random().toString(36).slice(2, 10)}`;
        bulkWriter.set(billRef.collection("lines").doc(lineId), line, { merge: true });
      }

      written += 1;
    }

    if ((i + CHUNK) % 1000 === 0 || i + CHUNK >= candidates.length) {
      console.log(`  processed ${Math.min(i + CHUNK, candidates.length)}/${candidates.length}...`);
    }
  }

  if (!DRY_RUN) {
    await bulkWriter.close();
  }

  const countSnap = await db.collection("pos_sales").doc(outletId).collection("bills").count().get();
  console.log("");
  console.log(`Written:          ${written}`);
  console.log(`Skipped existing: ${skipped}`);
  console.log(`No line items:    ${noLines}`);
  console.log(`Firestore bills:  ${countSnap.data().count}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
