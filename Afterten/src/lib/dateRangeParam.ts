/** Parse YYYY-MM-DD (or ISO) query params into local Date bounds. */
export function parseDateRangeParam(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;

  const ymd = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const parts = ymd.split("-").map((segment) => Number(segment));
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    if (endOfDay) {
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    }
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Calendar-day bounds in East Africa Time (matches MintPOS business days). */
export function parseBusinessDateRangeParam(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;

  const ymd = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return endOfDay ? new Date(`${ymd}T23:59:59.999+03:00`) : new Date(`${ymd}T00:00:00+03:00`);
  }

  return parseDateRangeParam(value, endOfDay);
}
