import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

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

async function upsertMenuGroupDraft(
  supabase: ReturnType<typeof getServiceClient>,
  group: Pick<MenuGroupRow, "id" | "name" | "pos_menu_group_id">
) {
  const payload = {
    change_type: "upsert_menu_group",
    name: group.name,
    pos_menu_group_id: group.pos_menu_group_id,
  };

  const { error } = await supabase.from("middleware_update_drafts").upsert(
    {
      entity_type: "menu_group",
      entity_id: group.id,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity_type,entity_id" }
  );

  if (error) throw error;
}

export async function GET(request: Request) {
  try {
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
      .order("sort_order", { ascending: true })
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
    const body = await request.json().catch(() => ({}));
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const posMenuGroupId =
      body.pos_menu_group_id === null || body.pos_menu_group_id === undefined || body.pos_menu_group_id === ""
        ? null
        : Number(body.pos_menu_group_id);
    if (posMenuGroupId !== null && !Number.isFinite(posMenuGroupId)) {
      return NextResponse.json({ error: "pos_menu_group_id must be numeric" }, { status: 400 });
    }

    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const active = body.active !== false;

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("catalog_menu_groups")
      .insert([
        {
          name,
          pos_menu_group_id: posMenuGroupId,
          sort_order: sortOrder,
          active,
          updated_at: new Date().toISOString(),
        },
      ])
      .select("id,name,pos_menu_group_id,active,sort_order")
      .single();

    if (error) throw error;

    try {
      await upsertMenuGroupDraft(supabase, data as MenuGroupRow);
    } catch (draftError) {
      console.error("[catalog/menu-groups] save draft failed", draftError);
    }

    return NextResponse.json({ group: data });
  } catch (error) {
    console.error("[catalog/menu-groups] POST failed", error);
    return NextResponse.json({ error: "Unable to create menu group" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const posMenuGroupId =
      body.pos_menu_group_id === null || body.pos_menu_group_id === undefined || body.pos_menu_group_id === ""
        ? null
        : Number(body.pos_menu_group_id);
    if (posMenuGroupId !== null && !Number.isFinite(posMenuGroupId)) {
      return NextResponse.json({ error: "pos_menu_group_id must be numeric" }, { status: 400 });
    }

    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const active = body.active !== false;

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("catalog_menu_groups")
      .update({
        name,
        pos_menu_group_id: posMenuGroupId,
        sort_order: sortOrder,
        active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,name,pos_menu_group_id,active,sort_order")
      .single();

    if (error) throw error;

    try {
      await upsertMenuGroupDraft(supabase, data as MenuGroupRow);
    } catch (draftError) {
      console.error("[catalog/menu-groups] save draft failed", draftError);
    }

    return NextResponse.json({ group: data });
  } catch (error) {
    console.error("[catalog/menu-groups] PUT failed", error);
    return NextResponse.json({ error: "Unable to update menu group" }, { status: 500 });
  }
}
