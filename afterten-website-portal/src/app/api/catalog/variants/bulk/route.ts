import { NextResponse } from "next/server";
import { firestoreCatalogVariantsBulkPatch } from "@/lib/firestore-catalog-variants";

export async function PATCH(request: Request) {
  try {
    return firestoreCatalogVariantsBulkPatch(request);
  } catch (error) {
    console.error("[catalog/variants/bulk] PATCH failed", error);
    return NextResponse.json({ error: "Unable to apply bulk variant update" }, { status: 500 });
  }
}
