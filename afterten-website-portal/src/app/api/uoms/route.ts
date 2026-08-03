import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  createFirestoreUomOption,
  deleteFirestoreUomOption,
  listAllFirestoreUomOptions,
  listFirestoreUomOptions,
  updateFirestoreUomOption,
} from "@/lib/firestore-uoms";
import { getServiceClient } from "@/lib/supabase-server";

type UomRow = {
  code: string;
  label: string | null;
  active?: boolean | null;
  sort_order?: number | null;
  updated_at?: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function mapSupabaseUomRow(row: UomRow) {
  return {
    code: row.code,
    label: row.label ?? row.code,
    active: row.active !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    updated_at: row.updated_at ?? undefined,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const admin = url.searchParams.get("admin") === "true";

    if (useFirebaseBackend()) {
      if (admin) {
        const uoms = await listAllFirestoreUomOptions();
        return NextResponse.json({ ok: true, uoms, cloud_backend: "firebase" });
      }
      const items = await listFirestoreUomOptions();
      return NextResponse.json({ ok: true, items, uoms: items, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from("uom_options")
      .select("code,label,active,sort_order,updated_at")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    if (!admin) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[api/uoms] uom_options unavailable, client will use defaults", error.message);
      return NextResponse.json({ ok: true, items: [], uoms: [] });
    }

    const rows = (data as UomRow[] | null) ?? [];

    if (admin) {
      const { defaultUomRecords } = await import("@/lib/default-uom-options");
      const storedByCode = new Map(rows.map((row) => [row.code, mapSupabaseUomRow(row)]));
      const merged = defaultUomRecords().map((defaults) => storedByCode.get(defaults.code) ?? defaults);
      for (const row of rows.map(mapSupabaseUomRow)) {
        if (!merged.some((item) => item.code === row.code)) merged.push(row);
      }
      merged.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      });
      return NextResponse.json({ ok: true, uoms: merged });
    }

    const items = rows
      .map((row) => ({
        value: row.code,
        label: row.label ?? row.code,
      }))
      .filter((row) => row.value && row.label);

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("uom options load failed", error);
    return NextResponse.json({ ok: true, items: [], uoms: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = cleanText(body.code);
    const label = cleanText(body.label);
    if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const active = body.active !== false;
    const now = new Date().toISOString();

    if (useFirebaseBackend()) {
      const uom = await createFirestoreUomOption({ code, label, active, sort_order: sortOrder });
      return NextResponse.json({ uom, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("uom_options")
      .insert([
        {
          code,
          label,
          active,
          sort_order: sortOrder,
          updated_at: now,
        },
      ])
      .select("code,label,active,sort_order,updated_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A UOM with this code already exists." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ uom: mapSupabaseUomRow(data as UomRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create UOM";
    const status = message.includes("already exists") ? 409 : 500;
    console.error("[api/uoms] POST failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = cleanText(body.code);
    const label = cleanText(body.label);
    if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const active = body.active !== false;
    const now = new Date().toISOString();

    if (useFirebaseBackend()) {
      const uom = await updateFirestoreUomOption(code, { label, active, sort_order: sortOrder });
      return NextResponse.json({ uom, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("uom_options")
      .update({
        label,
        active,
        sort_order: sortOrder,
        updated_at: now,
      })
      .eq("code", code)
      .select("code,label,active,sort_order,updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "UOM not found" }, { status: 404 });

    return NextResponse.json({ uom: mapSupabaseUomRow(data as UomRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update UOM";
    const status = /not found/i.test(message) ? 404 : 500;
    console.error("[api/uoms] PUT failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const code = cleanText(url.searchParams.get("code"));
    if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });

    if (useFirebaseBackend()) {
      await deleteFirestoreUomOption(code);
      return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("uom_options")
      .delete()
      .eq("code", code)
      .select("code")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "UOM not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete UOM";
    console.error("[api/uoms] DELETE failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
