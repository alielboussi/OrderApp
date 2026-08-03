import { NextResponse } from "next/server";
import {
  firestoreMenuGroupsGet,
  firestoreMenuGroupsPost,
  firestoreMenuGroupsPut,
} from "@/lib/firestore-catalog-menu-groups";

export async function GET(request: Request) {
  try {
    return firestoreMenuGroupsGet(request);
  } catch (error) {
    console.error("[catalog/menu-groups] GET failed", error);
    return NextResponse.json({ error: "Unable to load menu groups" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return firestoreMenuGroupsPost(request);
  } catch (error) {
    console.error("[catalog/menu-groups] POST failed", error);
    return NextResponse.json({ error: "Unable to create menu group" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    return firestoreMenuGroupsPut(request);
  } catch (error) {
    console.error("[catalog/menu-groups] PUT failed", error);
    return NextResponse.json({ error: "Unable to update menu group" }, { status: 500 });
  }
}
