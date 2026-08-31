import { NextRequest, NextResponse } from "next/server";
import { fetchPosSales } from "@/lib/pos-sales-store";

const MAX_LIMIT = 2000;
const DEFAULT_LIMIT = 500;
const DEFAULT_DAYS = 7;

const isUuid = (value: string) =>
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: string | null) => (value && isUuid(value) ? value.trim() : null);

const parseDate = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

const parseLimit = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const parseBranchId = (value: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
};

const parseBool = (value: string | null) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletParam = url.searchParams.get("outletId");
    const outletId = cleanUuid(outletParam);

    if (outletParam && !outletId) {
      return NextResponse.json({ error: "Invalid outletId" }, { status: 400 });
    }

    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");
    const since = parseDate(sinceParam);
    const until = parseDate(untilParam);

    const sourceEventId = url.searchParams.get("sourceEventId")?.trim() ?? "";
    const sourceEventPrefix = url.searchParams.get("sourceEventPrefix")?.trim() ?? "";
    const branchParam = url.searchParams.get("branchId");
    const branchId = parseBranchId(branchParam);

    if (sinceParam && !since) {
      return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
    }

    if (untilParam && !until) {
      return NextResponse.json({ error: "Invalid until timestamp" }, { status: 400 });
    }

    if (branchParam && branchId === null) {
      return NextResponse.json({ error: "Invalid branchId" }, { status: 400 });
    }

    const now = new Date();
    const effectiveSince = since ?? new Date(now.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    const effectiveUntil = until ?? now;

    if (effectiveSince > effectiveUntil) {
      return NextResponse.json({ error: "since must be before until" }, { status: 400 });
    }

    const includeSales = parseBool(url.searchParams.get("includeSales")) ||
      url.searchParams
        .get("include")
        ?.split(",")
        .map((value) => value.trim().toLowerCase())
        .includes("sales") === true;

    const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_LIMIT);

    const payload = await fetchPosSales({
  outletId,
  since: effectiveSince,
  until: effectiveUntil,
  sourceEventId: sourceEventId || undefined,
  sourceEventPrefix: sourceEventId ? undefined : sourceEventPrefix || undefined,
  branchId,
  limit,
  includeSales,
});
return NextResponse.json(payload);
    
  } catch (error) {
    console.error("[pos-sales] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS sales" }, { status: 500 });
  }
}
