import { readFileSync, writeFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows, columns) {
  const header = columns.map((column) => csvEscape(column)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

const csvArgIndex = process.argv.indexOf("--csv");
const csvPath =
  csvArgIndex >= 0 ? process.argv[csvArgIndex + 1] : process.env.STOCK_ALIGNMENT_CSV_OUTPUT?.trim() || "";

const includeInactive = process.argv.includes("--include-inactive");

const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
if (!token) {
  console.error("STOCK_SYNC_API_TOKEN is required");
  process.exit(1);
}

const credentialsPath =
  process.env.FIREBASE_CREDENTIALS_PATH ?? "C:\\Projects\\Afterten\\secrets\\afterten-firebase-adminsdk.json";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(readFileSync(credentialsPath, "utf8"))),
    projectId: process.env.FIREBASE_PROJECT_ID ?? "afterten-portal-system",
  });
}

const db = getFirestore();

const stockResponse = await fetch(
  process.env.STOCK_SYNC_API_URL ??
    "https://afterten-stock-api-896827614552.us-central1.run.app/sync/stock",
  {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  },
);
if (!stockResponse.ok) {
  throw new Error(`Stock API returned ${stockResponse.status}`);
}
const stockPayload = await stockResponse.json();
const quantities = {};
for (const warehouse of stockPayload.warehouses ?? []) {
  for (const item of warehouse.items ?? []) {
    const uuid = String(item.uuid ?? "").trim();
    if (!uuid) continue;
    const qty = Number(item.qty ?? 0);
    quantities[uuid] = (quantities[uuid] ?? 0) + (Number.isFinite(qty) ? qty : 0);
  }
}

const [itemsSnap, variantsSnap] = await Promise.all([
  db.collection("catalog_items").get(),
  db.collection("catalog_variants").get(),
]);

const variantItemIds = new Set(
  variantsSnap.docs.map((doc) => String(doc.get("item_id") ?? "").trim()).filter(Boolean),
);

const catalogRows = [];
for (const doc of itemsSnap.docs) {
  if (!includeInactive && doc.get("active") === false) continue;
  if (variantItemIds.has(doc.id)) continue;
  catalogRows.push({
    kind: "product",
    catalog_id: doc.id,
    product_id: doc.id,
    variant_id: null,
    name: String(doc.get("name") ?? "Product"),
    stock_uuid: doc.id,
    active: doc.get("active") !== false,
  });
}
for (const doc of variantsSnap.docs) {
  if (!includeInactive && doc.get("active") === false) continue;
  const variantId = doc.id;
  const productId = String(doc.get("item_id") ?? "").trim();
  if (!variantId || !productId) continue;
  catalogRows.push({
    kind: "variant",
    catalog_id: variantId,
    product_id: productId,
    variant_id: variantId,
    name: String(doc.get("name") ?? "Variant"),
    stock_uuid: variantId,
    active: doc.get("active") !== false,
  });
}

const missing = catalogRows
  .filter((row) => !(row.stock_uuid in quantities))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

const withoutUuid = [];
const seen = new Set();
for (const warehouse of stockPayload.warehouses ?? []) {
  for (const item of warehouse.items ?? []) {
    if (item.uuid) continue;
    const key = `${warehouse.warehouseUuid}::${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    withoutUuid.push({
      name: item.name,
      qty: item.qty,
      unit: item.unit ?? null,
      warehouse_uuid: warehouse.warehouseUuid,
      warehouse_name: warehouse.warehouseName,
    });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  stock_generated_at: stockPayload.generatedAt ?? null,
  summary: {
    catalog_rows: catalogRows.length,
    active_only: !includeInactive,
    catalog_matched_in_stock_api: catalogRows.length - missing.length,
    catalog_missing_in_stock_api: missing.length,
    stock_rows_without_uuid: withoutUuid.length,
  },
  catalog_missing_in_stock_api: missing,
  stock_api_rows_without_uuid: withoutUuid,
};

if (csvPath) {
  const missingCsv = toCsv(missing, [
    "kind",
    "catalog_id",
    "product_id",
    "variant_id",
    "name",
    "stock_uuid",
  ]);
  writeFileSync(csvPath, missingCsv, "utf8");
  console.error(`Wrote ${missing.length} catalog-missing rows to ${csvPath}`);
}

console.log(JSON.stringify(report, null, 2));
