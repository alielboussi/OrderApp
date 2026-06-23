/**
 * Filter supabase/Supabase Schema.sql to middleware + orders tables only.
 * Removes stock/warehouse/auth-role tables, views, and related metadata.
 *
 * Usage: node supabase/scripts/filter_schema_export.js
 */

const fs = require("fs");
const path = require("path");

const SCHEMA_PATH = path.join(__dirname, "..", "Supabase Schema.sql");
const BACKUP_PATH = path.join(__dirname, "..", "Supabase Schema.full-backup.sql");

const DROP_TABLES = new Set([
  "android_app_versions",
  "flow_trace_steps",
  "flow_traces",
  "item_storage_homes",
  "item_transfer_profiles",
  "item_warehouse_handling_policies",
  "outlet_item_routes",
  "outlet_order_routes",
  "outlet_pos_deduction_rules",
  "outlet_stock_balances",
  "outlet_stocktakes",
  "platform_admins",
  "pos_item_map",
  "product_supplier_links",
  "roles",
  "scanners",
  "stock_flow_batches",
  "stock_ledger",
  "stocktake_app_users",
  "supplier_scanners",
  "uom_conversions",
  "uom_options",
  "user_roles",
  "warehouse_backoffice_logs",
  "warehouse_damages",
  "warehouse_stock_counts",
  "warehouse_stock_periods",
  "warehouse_transfer_items",
  "warehouse_transfers",
]);

const DROP_VIEWS = new Set([
  "outlet_stock_summary",
  "v_hub_warehouses",
  "v_outlet_live_balances",
  "v_outlet_warehouse_ledger_balances",
  "warehouse_stock_variances",
]);

const DROP_COLUMNS = new Set([
  "default_warehouse_id",
  "locked_from_warehouse_id",
  "default_sales_warehouse_id",
  "default_receiving_warehouse_id",
  "warehouse_id",
  "storage_warehouse_id",
  "from_warehouse_id",
  "to_warehouse_id",
  "parent_warehouse_id",
]);

const STOCK_FUNCTION_PATTERNS = [
  /^stock_/,
  /^stocktake_/,
  /^warehouse_/,
  /^record_damage$/,
  /^record_stock/,
  /^record_outlet_sale$/,
  /^record_order_fulfillment$/,
  /^transfer_units_between/,
  /^list_warehouse_items$/,
  /^rollup_/,
  /^close_stock_period$/,
  /^start_stock_period$/,
  /^ensure_open_stock_period/,
  /^require_open_stock_period/,
  /^has_open_warehouse_period$/,
  /^has_stocktake_role$/,
  /^is_stocktake_user$/,
  /^can_operate_outlet_warehouse/,
  /^suppliers_for_warehouse$/,
  /^console_locked_warehouses$/,
  /^outlet_default_warehouses$/,
  /^seed_outlet_routes/,
  /^sync_item_storage_homes/,
  /^set_pos_sync_(cutoff|opening)_for_warehouse$/,
  /^set_android_app_versions/,
  /^set_stocktake_app_user/,
  /^set_transfer_operator/,
  /^set_uom_/,
  /^convert_uom_qty$/,
  /^replace_recipe_uom/,
  /^recipe_uom_available/,
  /^available_servings$/,
  /^next_stocktake_number$/,
  /^next_transfer_reference$/,
  /^enforce_outlet_single_warehouse$/,
  /^apply_pos_sale_deduction/,
  /^is_warehouse_app_order$/,
];

function keepTable(name) {
  return name && !DROP_TABLES.has(name);
}

function keepView(name) {
  return name && !DROP_VIEWS.has(name);
}

const WAREHOUSE_COLUMN_KEEP_TABLES = new Set([
  "warehouses",
  "outlet_warehouses",
  "warehouse_purchase_receipts",
  "warehouse_purchase_imports",
]);

function keepColumn(row) {
  if (!row?.table_name || !row?.column_name) return true;
  if (DROP_TABLES.has(row.table_name)) return false;
  if (DROP_COLUMNS.has(row.column_name) && !WAREHOUSE_COLUMN_KEEP_TABLES.has(row.table_name)) {
    return false;
  }
  return true;
}

function keepRowByTable(row) {
  const table = row?.table_name;
  if (!table) return true;
  return keepTable(table);
}

function keepFunction(fn) {
  const name = fn?.function_name ?? "";
  if (STOCK_FUNCTION_PATTERNS.some((re) => re.test(name))) return false;
  const def = fn?.definition ?? "";
  for (const table of DROP_TABLES) {
    if (def.includes(`public.${table}`) || def.includes(` ${table} `)) return false;
  }
  return true;
}

function filterSection(rows, predicate) {
  if (!Array.isArray(rows)) return rows;
  return rows.filter(predicate);
}

function main() {
  const raw = fs.readFileSync(SCHEMA_PATH, "utf8");
  if (!fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(BACKUP_PATH, raw, "utf8");
    console.log("Backup written:", BACKUP_PATH);
  }

  const doc = JSON.parse(raw);
  const exportRoot = doc[0]?.schema_export ?? doc.schema_export;
  if (!exportRoot) {
    throw new Error("Unexpected schema export shape");
  }

  exportRoot.tables = filterSection(exportRoot.tables, (t) => keepTable(t.table_name));
  exportRoot.views = filterSection(exportRoot.views, (v) => keepView(v.view_name));
  exportRoot.columns = filterSection(exportRoot.columns, keepColumn);
  exportRoot.indexes = filterSection(exportRoot.indexes, keepRowByTable);
  exportRoot.policies = filterSection(exportRoot.policies, keepRowByTable);
  exportRoot.triggers = filterSection(exportRoot.triggers, keepRowByTable);
  exportRoot.constraints = filterSection(exportRoot.constraints, keepRowByTable);
  exportRoot.foreign_keys = filterSection(exportRoot.foreign_keys, (fk) => {
    if (DROP_TABLES.has(fk.table_name)) return false;
    if (fk.foreign_table_name && DROP_TABLES.has(fk.foreign_table_name)) return false;
    if (fk.constraint_def) {
      for (const table of DROP_TABLES) {
        if (fk.constraint_def.includes(table)) return false;
      }
      for (const col of DROP_COLUMNS) {
        if (fk.constraint_def.includes(`(${col})`)) return false;
      }
    }
    return true;
  });
  exportRoot.functions = filterSection(exportRoot.functions, keepFunction);

  const out = JSON.stringify([{ schema_export: exportRoot }], null, 2) + "\n";
  fs.writeFileSync(SCHEMA_PATH, out, "utf8");

  const kept = exportRoot.tables.map((t) => t.table_name).sort();
  console.log("Filtered schema written:", SCHEMA_PATH);
  console.log("Kept tables (" + kept.length + "):", kept.join(", "));
}

main();
