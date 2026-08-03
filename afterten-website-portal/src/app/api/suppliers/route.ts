import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreSuppliers } from "@/lib/firestore-suppliers";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    if (useFirebaseBackend()) {
      const suppliers = await listFirestoreSuppliers();
      return NextResponse.json({ suppliers, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const primary = await supabase
      .from("suppliers")
      .select("id,name,contact_name,contact_phone,contact_email,whatsapp_number,notes,active")
      .order("name", { ascending: true });

    if (primary.error) throw primary.error;

    return NextResponse.json({ suppliers: primary.data ?? [] });
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
