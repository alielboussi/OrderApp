import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type SupplierPayload = {
  name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  notes?: string | null;
  scanner_ids?: string[] | null;
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

function cleanUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    const primary = await supabase
      .from("suppliers")
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active")
      .order("name", { ascending: true });

    if (primary.error) throw primary.error;

    const baseSuppliers = primary.data ?? [];

    const links = await supabase
      .from("supplier_scanners")
      .select("supplier_id,scanner:scanners(id,name)");

    if (links.error?.message?.toLowerCase().includes("supplier_scanners")) {
      return NextResponse.json({ suppliers: baseSuppliers });
    }
    if (links.error) throw links.error;

    const scannerMap = new Map<string, { id: string; name: string | null }[]>();
    (links.data ?? []).forEach((row) => {
      const supplierId = row?.supplier_id as string | null;
      const scanner = row?.scanner as unknown as { id: string; name: string | null } | null;
      if (!supplierId || !scanner?.id) return;
      const next = scannerMap.get(supplierId) ?? [];
      next.push(scanner);
      scannerMap.set(supplierId, next);
    });

    const suppliers = baseSuppliers.map((supplier) => {
      const scanners = scannerMap.get(supplier.id) ?? [];
      return {
        ...supplier,
        scanner_ids: scanners.map((scanner) => scanner.id),
        scanners,
      };
    });

    return NextResponse.json({ suppliers });
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
      active: cleanBoolean(body.active, true),
      updated_at: new Date().toISOString(),
    };

    const scannerIds = cleanUuidList(body.scanner_ids);

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert(payload)
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active")
      .single();

    if (error) throw error;

    if (scannerIds.length > 0) {
      const linkRows = scannerIds.map((scannerId) => ({ supplier_id: data.id, scanner_id: scannerId }));
      const { error: linkError } = await supabase.from("supplier_scanners").insert(linkRows);
      if (linkError && !linkError.message?.toLowerCase().includes("supplier_scanners")) {
        throw linkError;
      }
    }

    return NextResponse.json({ supplier: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create supplier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SupplierPayload & { id?: string };
    const id = cleanUuid(body.id);
    if (!id) {
      return NextResponse.json({ error: "Supplier id is required" }, { status: 400 });
    }

    const scannerIds = cleanUuidList(body.scanner_ids);

    const name = cleanText(body.name);
    if (!name) {
      return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      name,
      contact_name: cleanText(body.contact_name),
      contact_phone: cleanText(body.contact_phone),
      contact_email: cleanText(body.contact_email),
      whatsapp_number: cleanText(body.whatsapp_number),
      notes: cleanText(body.notes),
      active: cleanBoolean(body.active, true),
      updated_at: new Date().toISOString(),
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("suppliers")
      .update(update)
      .eq("id", id)
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active")
      .single();

    if (error) throw error;

    if (body.scanner_ids) {
      const { error: deleteError } = await supabase
        .from("supplier_scanners")
        .delete()
        .eq("supplier_id", id);
      if (deleteError && !deleteError.message?.toLowerCase().includes("supplier_scanners")) {
        throw deleteError;
      }

      if (scannerIds.length > 0) {
        const linkRows = scannerIds.map((scannerId) => ({ supplier_id: id, scanner_id: scannerId }));
        const { error: linkError } = await supabase.from("supplier_scanners").insert(linkRows);
        if (linkError && !linkError.message?.toLowerCase().includes("supplier_scanners")) {
          throw linkError;
        }
      }
    }

    return NextResponse.json({ supplier: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update supplier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
