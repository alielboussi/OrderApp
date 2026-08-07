export type OrderTotalOrderedInput = {
  outlet_qty: number;
  supervisor_uom_qty_per_unit: number;
  uom_weight_enabled?: boolean | null;
  uom_weight_grams?: number | null;
  orders_app_uom?: string | null;
  supervisor_uom?: string | null;
};

export type OrderTotalOrderedResult = {
  total_ordered: number;
  total_ordered_unit: string;
  uom_weight_enabled: boolean;
  uom_weight_grams: number | null;
};

function readPositiveInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function readUomWeightEnabled(value: unknown): boolean {
  return value === true;
}

export function readUomWeightGrams(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function computeOrderTotalOrdered(input: OrderTotalOrderedInput): OrderTotalOrderedResult {
  const outletQty = readPositiveInt(input.outlet_qty, 0);
  const perUnit =
    readPositiveInt(input.supervisor_uom_qty_per_unit, 1) > 0
      ? readPositiveInt(input.supervisor_uom_qty_per_unit, 1)
      : 1;
  const weightEnabled = readUomWeightEnabled(input.uom_weight_enabled);
  const weightGrams = readUomWeightGrams(input.uom_weight_grams);

  if (weightEnabled && weightGrams) {
    return {
      total_ordered: outletQty * weightGrams,
      total_ordered_unit: "g",
      uom_weight_enabled: true,
      uom_weight_grams: weightGrams,
    };
  }

  const unit =
    String(input.supervisor_uom ?? "").trim() ||
    String(input.orders_app_uom ?? "").trim() ||
    "pc";

  return {
    total_ordered: outletQty * perUnit,
    total_ordered_unit: unit,
    uom_weight_enabled: false,
    uom_weight_grams: null,
  };
}
