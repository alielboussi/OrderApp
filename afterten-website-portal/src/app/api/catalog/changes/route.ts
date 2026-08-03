import { NextResponse } from "next/server";
import { listFirestoreCatalogChangeEvents } from "@/lib/firestore-catalog-change-events";
import {
  CATALOG_CHANGE_TYPES,
  type CatalogChangeEventRow,
  type CatalogChangeType,
  type CatalogEntityType,
} from "@/lib/catalog-change-events";

function parseIso(value: string | null): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(Math.round(parsed), 1000);
}

function parseList(value: string | null): string[] {
  if (!value?.trim()) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const since = parseIso(url.searchParams.get("since"));
    const until = parseIso(url.searchParams.get("until"));
    const limit = parseLimit(url.searchParams.get("limit"));
    const entityId = url.searchParams.get("entity_id")?.trim() || null;
    const sku = url.searchParams.get("sku")?.trim() || null;

    const changeTypes = parseList(url.searchParams.get("change_type")).filter((value): value is CatalogChangeType =>
      (CATALOG_CHANGE_TYPES as readonly string[]).includes(value)
    );
    const entityTypes = parseList(url.searchParams.get("entity_type")).filter(
      (value): value is CatalogEntityType => value === "item" || value === "variant" || value === "menu_group"
    );

    const changes = (await listFirestoreCatalogChangeEvents({
  since,
  until,
  limit,
  entityId,
  sku,
  changeTypes,
  entityTypes,
})) as CatalogChangeEventRow[];
return NextResponse.json({
  changes,
  count: changes.length,
  latest_at: changes[0]?.created_at ?? null,
  polled_at: new Date().toISOString(),
  backend: "firebase",
});
    
  } catch (error) {
    console.error("[catalog/changes] GET failed", error);
    return NextResponse.json({ error: "Unable to load catalog changes" }, { status: 500 });
  }
}
