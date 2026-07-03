import { POS_ONLY_OUTLET_IDS } from "@/lib/outletScope";

/** MintPOS dbo.Shifts at Quick Corner — same windows used on Till 1/2 MINTPOS installs. */
export const MINTPOS_SHIFT_WINDOWS = [
  { shift_id: 3, shift_name: "Midnight Shift (00:00-08:00)", startMinutes: 0, endMinutes: 8 * 60 },
  { shift_id: 1, shift_name: "Day Shift (08:00-16:00)", startMinutes: 8 * 60, endMinutes: 16 * 60 },
  { shift_id: 2, shift_name: "Night Shift (16:00-00:00)", startMinutes: 16 * 60, endMinutes: 24 * 60 },
] as const;

const POS_SALE_TIMEZONE = "Africa/Johannesburg";

function localMinutesOfDay(soldAtIso: string): number | null {
  const parsed = Date.parse(soldAtIso);
  if (Number.isNaN(parsed)) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: POS_SALE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(parsed));

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
}

export function resolvePosShiftFromSoldAt(
  outletId: string,
  soldAtIso: string,
): { shift_id: number; shift_name: string } | null {
  if (!POS_ONLY_OUTLET_IDS.has(outletId)) return null;

  const minutes = localMinutesOfDay(soldAtIso);
  if (minutes === null) return null;

  for (const window of MINTPOS_SHIFT_WINDOWS) {
    if (minutes >= window.startMinutes && minutes < window.endMinutes) {
      return { shift_id: window.shift_id, shift_name: window.shift_name };
    }
  }

  return null;
}

export type SaleShiftFields = {
  shift_id: number | null;
  shift_name: string | null;
  shift_session_id: number | null;
  terminal: string | null;
  shift_session_start: string | null;
  shift_session_end: string | null;
  shift_session_status: string | null;
  shift_opened_by: string | null;
};

/** API source of truth for POS shift labels — derived from sold_at, not middleware payload. */
export function applyPosShiftFromSoldAt<T extends SaleShiftFields>(
  shift: T,
  outletId: string,
  soldAtIso: string,
): T {
  const derived = resolvePosShiftFromSoldAt(outletId, soldAtIso);
  if (!derived) return shift;

  return {
    ...shift,
    shift_id: derived.shift_id,
    shift_name: derived.shift_name,
  };
}
