export const MINTPOS_SHIFT_NAMES: Record<number, string> = {
  1: "Day",
  2: "Night",
  3: "Midnight",
};

export const MINTPOS_SHIFT_IDS = [1, 2, 3] as const;

export type MintposShiftId = (typeof MINTPOS_SHIFT_IDS)[number];

export function isMintposShiftId(value: number): value is MintposShiftId {
  return value === 1 || value === 2 || value === 3;
}

/** Parse `shift_ids` CSV. Returns null when the param is omitted (no shift filter). */
export function parseShiftIdsParam(value: string | null): number[] | null {
  if (value == null) return null;
  const ids = new Set<number>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const n = Number(trimmed);
    if (Number.isInteger(n) && isMintposShiftId(n)) ids.add(n);
  }
  return Array.from(ids).sort((a, b) => a - b);
}

export function extractShiftId(rawPayload: Record<string, unknown> | null | undefined): number | null {
  if (!rawPayload || !rawPayload.shift || typeof rawPayload.shift !== "object") return null;
  const shift = rawPayload.shift as Record<string, unknown>;
  const raw = shift.shift_id;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || !isMintposShiftId(n)) return null;
  return n;
}

export function shiftFilterIsAllInclusive(
  selectedShiftIds: number[],
  includeUnknownShift: boolean,
): boolean {
  return includeUnknownShift && MINTPOS_SHIFT_IDS.every((id) => selectedShiftIds.includes(id));
}

export function formatSelectedShiftHint(
  selectedShiftIds: number[],
  includeUnknownShift: boolean,
): string {
  if (shiftFilterIsAllInclusive(selectedShiftIds, includeUnknownShift)) {
    return "All shifts";
  }
  const names = selectedShiftIds
    .filter(isMintposShiftId)
    .map((id) => MINTPOS_SHIFT_NAMES[id])
    .filter(Boolean);
  if (includeUnknownShift) names.push("Unknown");
  return names.length > 0 ? names.join(", ") : "No shifts";
}
