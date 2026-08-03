export type CatalogSyncSchedule = {
  id: string;
  scheduled_at: string | null;
  updated_at?: string | null;
};

export function normalizeFutureScheduledAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime() > Date.now() ? parsed.toISOString() : null;
}
