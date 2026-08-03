import { NextResponse } from "next/server";
import {
  createFirestoreUomOption,
  deleteFirestoreUomOption,
  listAllFirestoreUomOptions,
  listFirestoreUomOptions,
  updateFirestoreUomOption,
} from "@/lib/firestore-uoms";

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

function mapUomRow(row: UomRow) {
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

    if (admin) {
  const uoms = await listAllFirestoreUomOptions();
  return NextResponse.json({ ok: true, uoms, cloud_backend: "firebase" });
}
const items = await listFirestoreUomOptions();
return NextResponse.json({ ok: true, items, uoms: items, cloud_backend: "firebase" });
    
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

    const uom = await createFirestoreUomOption({ code, label, active, sort_order: sortOrder });
return NextResponse.json({ uom, cloud_backend: "firebase" });
    
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

    const uom = await updateFirestoreUomOption(code, { label, active, sort_order: sortOrder });
return NextResponse.json({ uom, cloud_backend: "firebase" });
    
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

    await deleteFirestoreUomOption(code);
return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete UOM";
    console.error("[api/uoms] DELETE failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
