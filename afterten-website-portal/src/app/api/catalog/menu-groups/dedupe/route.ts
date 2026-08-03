import { NextResponse } from "next/server";
import { dedupeFirestoreMenuGroupsByPosId } from "@/lib/firestore-menu-group-dedup";

export async function POST() {
  try {
    const result = await dedupeFirestoreMenuGroupsByPosId();
    return NextResponse.json({ ok: true, ...result, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[catalog/menu-groups/dedupe] POST failed", error);
    return NextResponse.json({ error: "Unable to remove duplicate menu groups" }, { status: 500 });
  }
}
