/**
 * Lists stock-system issues your brother must fix (not portal cleanup).
 *
 * Usage:
 *   $env:STOCK_SYNC_API_TOKEN="<token>"
 *   node "Afterten Website Portal/scripts/stock-api-brother-report.mjs"
 *
 * Optional:
 *   --csv "path/to/report.csv"
 *   --json-only
 */
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_STOCK_CATALOG_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";
const DEFAULT_STOCK_SYNC_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/stock";

const jsonOnly = process.argv.includes("--json-only");
const csvArgIndex = process.argv.indexOf("--csv");
const csvPath = csvArgIndex >= 0 ? process.argv[csvArgIndex + 1] : "";

const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
if (!token) {
  console.error("STOCK_SYNC_API_TOKEN is required");
  process.exit(1);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows, columns) {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

const [catalogPayload, stockPayload] = await Promise.all([
  fetchJson(process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL),
  fetchJson(process.env.STOCK_SYNC_API_URL?.trim() || DEFAULT_STOCK_SYNC_API_URL),
]);

const catalogProducts = (catalogPayload.products ?? [])
  .map((product) => ({
    uuid: String(product.uuid ?? "").trim(),
    name: String(product.name ?? "").trim() || "Unnamed",
    warehouse: String(product.warehouse?.name ?? "").trim() || null,
    unit: String(product.unit?.name ?? "").trim() || null,
  }))
  .filter((product) => product.uuid);

const stockByUuid = new Map();
const stockWithoutUuid = [];
const seenNoUuid = new Set();

for (const warehouse of stockPayload.warehouses ?? []) {
  const warehouseName = String(warehouse.warehouseName ?? "").trim() || "Unknown warehouse";
  const warehouseUuid = String(warehouse.warehouseUuid ?? "").trim() || null;

  for (const item of warehouse.items ?? []) {
    const uuid = String(item.uuid ?? "").trim();
    const name = String(item.name ?? "").trim() || "Unnamed";
    const qty = Number(item.qty ?? 0);

    if (!uuid) {
      const key = `${warehouseUuid ?? warehouseName}::${name}`;
      if (seenNoUuid.has(key)) continue;
      seenNoUuid.add(key);
      stockWithoutUuid.push({
        issue: "stock_row_missing_uuid",
        likely_cause: "stock_row_has_no_uuid",
        action: "Add a UUID to this stock row in the stock system",
        uuid: "",
        name,
        warehouse_name: warehouseName,
        warehouse_uuid: warehouseUuid,
        unit: item.unit ?? null,
        qty,
      });
      continue;
    }

    const existing = stockByUuid.get(uuid);
    if (existing) {
      existing.qty += Number.isFinite(qty) ? qty : 0;
      continue;
    }

    stockByUuid.set(uuid, {
      uuid,
      name,
      warehouse_name: warehouseName,
      qty: Number.isFinite(qty) ? qty : 0,
      unit: item.unit ?? null,
    });
  }
}

const catalogNotInStock = [];
for (const product of catalogProducts) {
  if (stockByUuid.has(product.uuid)) continue;
  catalogNotInStock.push({
    issue: "in_catalog_not_in_stock",
    action:
      "Likely stock qty < 0 — include in /sync/stock with same UUID and actual qty (even if negative), OR confirm intentional omission",
    likely_cause: "negative_or_zero_stock_omitted_from_stock_api",
    uuid: product.uuid,
    name: product.name,
    warehouse_name: product.warehouse,
    unit: product.unit,
    qty: null,
  });
}

const brotherItems = [...stockWithoutUuid, ...catalogNotInStock].sort((left, right) => {
  if (left.issue !== right.issue) return left.issue.localeCompare(right.issue);
  const warehouse = String(left.warehouse_name ?? "").localeCompare(String(right.warehouse_name ?? ""));
  if (warehouse !== 0) return warehouse;
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
});

const report = {
  generated_at: new Date().toISOString(),
  catalog_generated_at: catalogPayload.generatedAt ?? null,
  stock_generated_at: stockPayload.generatedAt ?? null,
  summary: {
    total_for_brother: brotherItems.length,
    stock_rows_missing_uuid: stockWithoutUuid.length,
    catalog_products_missing_from_stock: catalogNotInStock.length,
    catalog_products_missing_likely_negative_stock: catalogNotInStock.length,
    catalog_api_products: catalogProducts.length,
    stock_api_uuids: stockByUuid.size,
  },
  ask_brother_about: brotherItems,
};

if (csvPath) {
  writeFileSync(
    csvPath,
    toCsv(brotherItems, [
      "issue",
      "likely_cause",
      "action",
      "uuid",
      "name",
      "warehouse_name",
      "warehouse_uuid",
      "unit",
      "qty",
    ]),
    "utf8",
  );
  if (!jsonOnly) console.error(`Wrote ${brotherItems.length} rows to ${csvPath}`);
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log("");
console.log("=== ASK YOUR BROTHER ABOUT THESE ===");
console.log(`Total: ${brotherItems.length}`);
console.log(`  - Stock rows with NO UUID: ${stockWithoutUuid.length}`);
console.log(`  - In catalog API but missing from stock API: ${catalogNotInStock.length}`);
console.log("");

if (!brotherItems.length) {
  console.log("Nothing to raise — catalog and stock UUIDs are aligned.");
  process.exit(0);
}

let lastIssue = "";
for (const row of brotherItems) {
  if (row.issue !== lastIssue) {
    lastIssue = row.issue;
    console.log("");
    if (row.issue === "stock_row_missing_uuid") {
      console.log("--- STOCK ROWS MISSING UUID (urgent) ---");
    } else {
      console.log("--- IN CATALOG BUT NOT IN STOCK API (likely qty < 0) ---");
    }
  }

  if (row.issue === "stock_row_missing_uuid") {
    console.log(`  • ${row.name}`);
    console.log(`    Warehouse: ${row.warehouse_name ?? "?"}`);
    console.log(`    Qty: ${row.qty}${row.unit ? ` ${row.unit}` : ""}`);
    console.log(`    Fix: ${row.action}`);
  } else {
    console.log(`  • ${row.name}`);
    console.log(`    UUID: ${row.uuid}`);
    if (row.warehouse_name) console.log(`    Warehouse: ${row.warehouse_name}`);
    if (row.unit) console.log(`    Unit: ${row.unit}`);
    console.log(`    Fix: ${row.action}`);
  }
}

console.log("");
console.log("Full JSON available with: node ... --json-only");
console.log("CSV export: node ... --csv \"reports/brother-stock-gaps.csv\"");
