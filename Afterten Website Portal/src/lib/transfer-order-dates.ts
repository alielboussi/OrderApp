export const TRANSFER_ORDER_TIME_ZONE = "Africa/Lusaka";

export function formatTransferOrderDateKey(
  date: Date,
  timeZone: string = TRANSFER_ORDER_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isTransferOrderOnDate(
  createdAt: string | null | undefined,
  dateYmd: string,
  timeZone: string = TRANSFER_ORDER_TIME_ZONE,
): boolean {
  if (!createdAt?.trim()) return false;
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return formatTransferOrderDateKey(parsed, timeZone) === dateYmd;
}

export function resolveTransferOrderCreatedAt(data: Record<string, unknown>): string | null {
  const candidates = [data.createdAt, data.created_at, data.updatedAt, data.updated_at];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && "toDate" in candidate && typeof candidate.toDate === "function") {
      return candidate.toDate().toISOString();
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}
