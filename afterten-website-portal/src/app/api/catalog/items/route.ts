import { NextResponse } from "next/server";
import {
  firestoreCatalogItemsDelete,
  firestoreCatalogItemsGet,
  firestoreCatalogItemsPost,
  firestoreCatalogItemsPut,
} from "@/lib/firestore-catalog-items";

export async function GET(request: Request) {
  try {
    return firestoreCatalogItemsGet(request);
  } catch (error) {
    console.error("[catalog/items] GET failed", error);
    return NextResponse.json({ error: "Unable to load catalog items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return firestoreCatalogItemsPost(request);
  } catch (error) {
    console.error("[catalog/items] POST failed", error);
    return NextResponse.json({ error: "Unable to create catalog item" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    return firestoreCatalogItemsPut(request);
  } catch (error) {
    console.error("[catalog/items] PUT failed", error);
    return NextResponse.json({ error: "Unable to update catalog item" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    return firestoreCatalogItemsDelete(request);
  } catch (error) {
    console.error("[catalog/items] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete catalog item" }, { status: 500 });
  }
}
