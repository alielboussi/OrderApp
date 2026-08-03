import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { nextPosMenuGroupId } from "@/lib/pos-catalog-ids";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  firestoreMenuGroupsGet,
  firestoreMenuGroupsPost,
  firestoreMenuGroupsPut,
} from "@/lib/firestore-catalog-menu-groups";
import {
  MENU_GROUP_TRACKED_FIELDS,
  parseCatalogChangeActor,
  recordCatalogChangeEvent,
} from "@/lib/catalog-change-events";

type MenuGroupRow = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value);
}

export async function GET(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreMenuGroupsGet(request);
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"));
    const supabase = getServiceClient();

    if (id) {
      if (!isUuid(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("catalog_menu_groups")
        .select("id,name,pos_menu_group_id,active,sort_order,created_at,updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Menu group not found" }, { status: 404 });
      return NextResponse.json({ group: data });
    }

    const { data, error } = await supabase
      .from("catalog_menu_groups")
      .select("id,name,pos_menu_group_id,active,sort_order,created_at,updated_at")
      .order("pos_menu_group_id", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ groups: data ?? [] });
  } catch (error) {
    console.error("[catalog/menu-groups] GET failed", error);
    return NextResponse.json({ error: "Unable to load menu groups" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreMenuGroupsPost(request);
    const body = await request.json().catch(() => ({}));
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const active = body.active !== false;

    const supabase = getServiceClient();
    const resolvedPosMenuGroupId = await nextPosMenuGroupId(supabase);

    const { data, error } = await supabase
      .from("catalog_menu_groups")
      .insert([
        {
          name,
          pos_menu_group_id: resolvedPosMenuGroupId,
          sort_order: sortOrder,
          active,
          updated_at: new Date().toISOString(),
        },
      ])
      .select("id,name,pos_menu_group_id,active,sort_order")
      .single();

    if (error) throw error;

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "insert",
      entityType: "menu_group",
      entityId: data.id,
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

    return NextResponse.json({ group: data });
  } catch (error) {
    console.error("[catalog/menu-groups] POST failed", error);
    return NextResponse.json({ error: "Unable to create menu group" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreMenuGroupsPut(request);
    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const active = body.active !== false;

    const supabase = getServiceClient();
    const { data: existingRow, error: existingError } = await supabase
      .from("catalog_menu_groups")
      .select("id,name,pos_menu_group_id,active,sort_order")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existingRow) return NextResponse.json({ error: "Menu group not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("catalog_menu_groups")
      .update({
        name,
        pos_menu_group_id: existingRow.pos_menu_group_id,
        sort_order: sortOrder,
        active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,name,pos_menu_group_id,active,sort_order")
      .single();

    if (error) throw error;

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "update",
      entityType: "menu_group",
      entityId: id,
      entityName: name,
      actor,
      before: existingRow as Record<string, unknown>,
      after: {
        name,
        pos_menu_group_id: existingRow.pos_menu_group_id,
        active,
        sort_order: sortOrder,
      },
      trackedFields: [...MENU_GROUP_TRACKED_FIELDS],
    });

    return NextResponse.json({ group: data });
  } catch (error) {
    console.error("[catalog/menu-groups] PUT failed", error);
    return NextResponse.json({ error: "Unable to update menu group" }, { status: 500 });
  }
}
