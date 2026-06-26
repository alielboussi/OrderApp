import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getServiceClient();
    const primary = await supabase
      .from("suppliers")
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active")
      .order("name", { ascending: true });

    if (primary.error) throw primary.error;

    const baseSuppliers = primary.data ?? [];
    return NextResponse.json({ suppliers: baseSuppliers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load suppliers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Manual supplier creation is disabled. Suppliers are created when purchase movements are imported from the stock API.",
    },
    { status: 403 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Manual supplier updates are disabled. Suppliers are maintained from purchase import data.",
    },
    { status: 403 },
  );
}
