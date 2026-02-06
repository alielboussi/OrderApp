import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type SupplierPayload = {
  name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  notes?: string | null;
  scanner_id?: string | null;
  scanner_area?: string | null;
  active?: boolean;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    let { data, error } = await supabase
      .from("suppliers")
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active,scanner_id,scanner:scanners(id,name)")
      .order("name", { ascending: true });
    if (error?.message?.includes("scanner")) {
      ({ data, error } = await supabase
        .from("suppliers")
        .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active")
        .order("name", { ascending: true }));
    }

    if (error) throw error;

    return NextResponse.json({ suppliers: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load suppliers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SupplierPayload;
    const name = cleanText(body.name);
    if (!name) {
      return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    }

    const payload = {
      name,
      contact_name: cleanText(body.contact_name),
      contact_phone: cleanText(body.contact_phone),
      contact_email: cleanText(body.contact_email),
      whatsapp_number: cleanText(body.whatsapp_number),
      notes: cleanText(body.notes),
      scanner_id: cleanUuid(body.scanner_id),
      scanner_area: cleanText(body.scanner_area),
      active: cleanBoolean(body.active, true),
      updated_at: new Date().toISOString(),
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert(payload)
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active,scanner_id,scanner_area")
      .single();

    if (error) throw error;

    return NextResponse.json({ supplier: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create supplier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
