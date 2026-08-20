export type HeartbeatRow = {
  outlet_id: string;
  last_seen_at: string;
  middleware_version: string | null;
  host_name: string | null;
  outlets: Array<{ id: string; name: string; code?: string | null }> | null;
};

export type OutletRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
};

export type MiddlewareScheduleRow = {
  id: string;
  scheduled_at: string | null;
  updated_at?: string | null;
};

export type CatalogSyncEventRow = {
  outlet_id: string;
  delivered_at: string | null;
  entity_type: string | null;
  payload: { command?: string | null } | null;
};

export const OFFLINE_MS = 10 * 60 * 1000;
export const MIDDLEWARE_POLL_MS = 120_000;

export const EXCLUDED_HEARTBEAT_OUTLET_IDS = new Set<string>([
  "24709409-08de-4906-b8ad-5b8d01db4a0b", // Ingredients Storeroom
  "5b6934d6-a22d-424e-a257-c1a867edd3df", // Flour Potatoes Storeroom
  "a497b8e7-31be-412d-817e-2b1ac9dda1d3", // Soyola Storeroom
  "efb641b2-e3ed-4b04-924e-44b1c21d6213", // Coldrooms Storerooms
]);

export function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function isPosCatalogSyncEvent(row: CatalogSyncEventRow): boolean {
  return row.entity_type === "sync_pos_catalog" || row.payload?.command === "sync_pos_catalog";
}

export function formatCountdown(targetIso: string | null, nowMs: number) {
  if (!targetIso) return "Immediate";
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return "Immediate";
  const diffMs = target.getTime() - nowMs;
  if (diffMs <= 0) return "Due now";

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function isHeartbeatMonitoredOutlet(outlet: OutletRow): boolean {
  if (outlet.active === false) return false;
  if (EXCLUDED_HEARTBEAT_OUTLET_IDS.has(outlet.id)) return false;

  const label = `${outlet.name ?? ""} ${outlet.code ?? ""}`.toLowerCase();
  if (/\bstorerooms?\b/i.test(label)) return false;

  if (outlet.has_pos_middleware === true) return true;

  const channel = (outlet.channel ?? "").trim().toLowerCase();
  return channel === "point of sale" || channel === "pos";
}
