import { normalizeUomCode } from "@/lib/uom-codes";
import { parseStoredCatalogUom } from "@/lib/catalog-uom-fields";
import type { UomOption } from "@/lib/catalog-uom-fields";

/** Canonical ordering fields — the only UOM sources the Orders app may use. */
export type CatalogOrderFields = {
  consumption_uom: string;
  orders_app_uom: string;
  supervisor_uom: string;
  supervisor_uom_qty_per_unit: number;
  orders_app_cost_price: number;
  uom_weight_enabled: boolean;
  uom_weight_grams: number | null;
};

function readText(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

function readBoolean(data: Record<string, unknown>, keys: readonly string[]): boolean {
  for (const key of keys) {
    const raw = data[key];
    if (raw === true) return true;
    if (raw === false) return false;
  }
  return false;
}

function readOptionalGrams(data: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const raw = data[key];
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function readNumber(data: Record<string, unknown>, keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const raw = data[key];
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function readCatalogOrderFieldsFromRow(
  row: Record<string, unknown>,
  options: ReadonlyArray<UomOption> = [],
): CatalogOrderFields {
  const ordersApp = parseStoredCatalogUom(
    readText(row, ["orders_app_uom", "ordersAppUom"]) || undefined,
    options,
    "",
  );
  const consumption = parseStoredCatalogUom(
    readText(row, ["consumption_unit", "consumption_uom", "consumptionUom"]) || ordersApp,
    options,
    ordersApp,
  );
  const supervisor = parseStoredCatalogUom(
    readText(row, ["supervisor_uom", "supervisorUom"]) || ordersApp,
    options,
    ordersApp,
  );
  const cost = readNumber(row, ["orders_app_cost_price", "ordersAppCostPrice"], 0);
  const uomWeightEnabled = readBoolean(row, ["uom_weight_enabled", "uomWeightEnabled"]);
  const uomWeightGrams = readOptionalGrams(row, ["uom_weight_grams", "uomWeightGrams"]);

  return {
    consumption_uom: consumption,
    orders_app_uom: ordersApp,
    supervisor_uom: supervisor,
    supervisor_uom_qty_per_unit: readNumber(
      row,
      ["supervisor_uom_qty_per_unit", "supervisorUomQtyPerUnit"],
      1,
    ),
    orders_app_cost_price: cost,
    uom_weight_enabled: uomWeightEnabled,
    uom_weight_grams: uomWeightEnabled ? uomWeightGrams : null,
  };
}

export function resolveStrictOrdersAppUom(data: Record<string, unknown>, fallback = ""): string {
  const raw = readText(data, ["ordersAppUom", "orders_app_uom"]);
  return raw ? normalizeUomCode(raw, fallback) : fallback;
}

export function resolveStrictSupervisorUom(data: Record<string, unknown>, fallback = ""): string {
  const raw = readText(data, ["supervisorUom", "supervisor_uom"]);
  if (raw) return normalizeUomCode(raw, fallback);
  return resolveStrictOrdersAppUom(data, fallback);
}

export function resolveStrictConsumptionUom(data: Record<string, unknown>, fallback = ""): string {
  const raw = readText(data, ["consumptionUom", "consumption_uom", "consumption_unit"]);
  if (raw) return normalizeUomCode(raw, fallback);
  return resolveStrictOrdersAppUom(data, fallback);
}

export type CatalogUomWeightFields = {
  uom_weight_enabled: boolean;
  uom_weight_grams: number | null;
};

export function resolveCatalogUomWeight(
  body: Record<string, unknown>,
): CatalogUomWeightFields | { error: string } {
  const enabled = readBoolean(body, ["uom_weight_enabled", "uomWeightEnabled"]);
  if (!enabled) {
    return { uom_weight_enabled: false, uom_weight_grams: null };
  }
  const grams = readOptionalGrams(body, ["uom_weight_grams", "uomWeightGrams"]);
  if (!grams) {
    return { error: "UOM Weight must be greater than 0 grams when enabled." };
  }
  return { uom_weight_enabled: true, uom_weight_grams: grams };
}

export function buildOutletOrderCatalogOrderFields(
  source: Record<string, unknown>,
): Pick<
  Record<string, unknown>,
  | "ordersAppUom"
  | "orders_app_uom"
  | "supervisorUom"
  | "supervisor_uom"
  | "consumptionUom"
  | "consumption_uom"
  | "supervisorUomQtyPerUnit"
  | "supervisor_uom_qty_per_unit"
  | "ordersAppCostPrice"
  | "orders_app_cost_price"
  | "uomWeightEnabled"
  | "uom_weight_enabled"
  | "uomWeightGrams"
  | "uom_weight_grams"
  | "sellingPrice"
> {
  const fields = readCatalogOrderFieldsFromRow(source);
  return {
    ordersAppUom: fields.orders_app_uom,
    orders_app_uom: fields.orders_app_uom,
    supervisorUom: fields.supervisor_uom,
    supervisor_uom: fields.supervisor_uom,
    consumptionUom: fields.consumption_uom,
    consumption_uom: fields.consumption_uom,
    supervisorUomQtyPerUnit: fields.supervisor_uom_qty_per_unit,
    supervisor_uom_qty_per_unit: fields.supervisor_uom_qty_per_unit,
    ordersAppCostPrice: fields.orders_app_cost_price,
    orders_app_cost_price: fields.orders_app_cost_price,
    uomWeightEnabled: fields.uom_weight_enabled,
    uom_weight_enabled: fields.uom_weight_enabled,
    uomWeightGrams: fields.uom_weight_grams,
    uom_weight_grams: fields.uom_weight_grams,
    sellingPrice: fields.orders_app_cost_price,
  };
}
