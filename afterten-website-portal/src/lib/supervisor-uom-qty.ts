export function resolveSupervisorUomQtyPerUnit(
  row?: { supervisor_uom_qty_per_unit?: unknown; supervisorUomQtyPerUnit?: unknown } | null,
): number {
  if (!row) return 1;
  const perUnit =
    typeof row.supervisor_uom_qty_per_unit === "number"
      ? row.supervisor_uom_qty_per_unit
      : typeof row.supervisorUomQtyPerUnit === "number"
        ? row.supervisorUomQtyPerUnit
        : Number(row.supervisor_uom_qty_per_unit ?? row.supervisorUomQtyPerUnit);
  if (!Number.isFinite(perUnit) || perUnit <= 0) return 1;
  return Math.floor(perUnit);
}

/** Stored order qty is always in outlet/base units. */
export function toSupervisorDisplayQty(storedQty: number, perUnit: number): number {
  const qty = Math.max(0, Math.floor(storedQty));
  if (perUnit <= 1) return qty;
  return Math.max(1, Math.round(qty / perUnit));
}

export function fromSupervisorDisplayQty(supervisorQty: number, perUnit: number): number {
  const qty = Math.max(1, Math.floor(supervisorQty));
  if (perUnit <= 1) return qty;
  return qty * perUnit;
}
