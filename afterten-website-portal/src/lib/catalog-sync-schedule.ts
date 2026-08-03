export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultScheduledLocalValue(): string {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return toDatetimeLocalValue(nextHour);
}

export function normalizeScheduleInput(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function isFutureSchedule(iso: string, nowMs = Date.now()): boolean {
  return new Date(iso).getTime() > nowMs;
}

export type CatalogDeliveryTiming = {
  delivery: "now" | "schedule";
  scheduledAt: string | null;
};

export function parseCatalogDeliveryTiming(
  body: unknown
): CatalogDeliveryTiming | { error: string } {
  const deliveryRaw =
    body && typeof body === "object" && typeof (body as { delivery?: unknown }).delivery === "string"
      ? (body as { delivery: string }).delivery.trim().toLowerCase()
      : "now";

  const scheduledAt = normalizeScheduleInput(
    body && typeof body === "object" ? (body as { scheduled_at?: unknown }).scheduled_at : null
  );

  if (deliveryRaw === "schedule") {
    if (!scheduledAt) {
      return { error: "A valid schedule date/time is required." };
    }
    if (!isFutureSchedule(scheduledAt)) {
      return { error: "Scheduled date/time must be in the future." };
    }
    return { delivery: "schedule", scheduledAt };
  }

  return { delivery: "now", scheduledAt: null };
}

export function formatScheduleLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
