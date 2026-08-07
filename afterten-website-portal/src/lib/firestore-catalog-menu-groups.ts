import { NextResponse } from "next/server";
import {
  MENU_GROUP_TRACKED_FIELDS,
  parseCatalogChangeActor,
  recordCatalogChange,
} from "@/lib/catalog-change-events";
import { nextFirestorePosMenuGroupId } from "@/lib/firestore-pos-catalog-ids";
import {
  createFirestoreMenuGroup,
  getFirestoreMenuGroup,
  listFirestoreMenuGroups,
  updateFirestoreMenuGroup,
} from "@/lib/firestore-catalog-store";
import { listMintPosMenuGroupOptions } from "@/lib/menu-group-pos";

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value);
}

function isMenuGroupId(value: string): boolean {
  return isUuid(value) || /^\d+$/.test(value);
}

export async function firestoreMenuGroupsGet(request: Request) {
  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  if (id) {
    if (!isMenuGroupId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const group = await getFirestoreMenuGroup(id);
    if (!group) return NextResponse.json({ error: "Menu group not found" }, { status: 404 });
    return NextResponse.json({ group, backend: "firebase" });
  }
  const groups = await listFirestoreMenuGroups();
  const mintposOnly = url.searchParams.get("mintpos_only") === "true";
  return NextResponse.json({
    groups: mintposOnly ? listMintPosMenuGroupOptions(groups) : groups,
    backend: "firebase",
  });
}

export async function firestoreMenuGroupsPost(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const active = body.active !== false;
  const resolvedPosMenuGroupId = await nextFirestorePosMenuGroupId();

  const data = await createFirestoreMenuGroup({
    name,
    pos_menu_group_id: resolvedPosMenuGroupId,
    sort_order: sortOrder,
    active,
  });

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "insert",
    entityType: "menu_group",
    entityId: String(data.id),
    entityName: name,
    actor,
    after: {
      name,
      pos_menu_group_id: resolvedPosMenuGroupId,
      active,
      sort_order: sortOrder,
    },
    trackedFields: [...MENU_GROUP_TRACKED_FIELDS],
  });

  return NextResponse.json({ group: data, backend: "firebase" });
}

export async function firestoreMenuGroupsPut(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = cleanText(body.id);
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

  const name = cleanText(body.name);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const active = body.active !== false;

  const existingRow = await getFirestoreMenuGroup(id);
  if (!existingRow) return NextResponse.json({ error: "Menu group not found" }, { status: 404 });

  const data = await updateFirestoreMenuGroup(id, {
    name,
    pos_menu_group_id: existingRow.pos_menu_group_id ?? null,
    sort_order: sortOrder,
    active,
  });
  if (!data) return NextResponse.json({ error: "Menu group not found" }, { status: 404 });

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "update",
    entityType: "menu_group",
    entityId: id,
    entityName: name,
    actor,
    before: existingRow,
    after: {
      name,
      pos_menu_group_id: existingRow.pos_menu_group_id ?? null,
      active,
      sort_order: sortOrder,
    },
    trackedFields: [...MENU_GROUP_TRACKED_FIELDS],
  });

  return NextResponse.json({ group: data, backend: "firebase" });
}
