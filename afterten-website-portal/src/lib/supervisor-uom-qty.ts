export function resolveSupervisorUomQtyPerUnit(
  row: { supervisor_uom_qty_per_unit?: unknown } | null | undefined,
): number {
  const explicit = Number(row?.supervisor_uom_qty_per_unit);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return 1;
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
