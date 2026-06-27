const PACK_UOMS = new Set([
  "plastic",
  "plastics",
  "case",
  "crate",
  "bottle",
  "tin can",
  "jar",
  "bag",
  "box",
  "packet",
  "tray",
  "bucket",
  "block",
]);

export function isPackConsumptionUom(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "pc" || normalized === "pcs" || normalized === "each") return false;
  return PACK_UOMS.has(normalized);
}

export function packUnitsLabel(value?: string | null): string {
  const uom = value?.trim().toLowerCase() || "pack";
  return uom === "plastic" || uom === "plastics" ? "Units per plastic" : `Units per ${uom}`;
}
