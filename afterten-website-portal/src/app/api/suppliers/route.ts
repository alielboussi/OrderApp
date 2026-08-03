import { NextResponse } from "next/server";
import { listFirestoreSuppliers } from "@/lib/firestore-suppliers";

export async function GET() {
  try {
    const suppliers = await listFirestoreSuppliers();
return NextResponse.json({ suppliers, cloud_backend: "firebase" });
    
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
