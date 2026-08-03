import { NextResponse } from "next/server";
import {
  firestoreCatalogVariantsDelete,
  firestoreCatalogVariantsGet,
  firestoreCatalogVariantsPost,
  firestoreCatalogVariantsPut,
} from "@/lib/firestore-catalog-variants";

export async function GET(request: Request) {
  try {
    return firestoreCatalogVariantsGet(request);
  } catch (error) {
    console.error("[catalog/variants] GET failed", error);
    return NextResponse.json({ error: "Unable to load variants" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return firestoreCatalogVariantsPost(request);
  } catch (error) {
    console.error("[catalog/variants] POST failed", error);
    return NextResponse.json({ error: "Unable to create variant" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    return firestoreCatalogVariantsPut(request);
  } catch (error) {
    console.error("[catalog/variants] PUT failed", error);
    return NextResponse.json({ error: "Unable to update variant" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    return firestoreCatalogVariantsDelete(request);
  } catch (error) {
    console.error("[catalog/variants] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete variant" }, { status: 500 });
  }
}
