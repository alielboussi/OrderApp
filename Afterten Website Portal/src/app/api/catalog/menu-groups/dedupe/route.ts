import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { dedupeMenuGroupsByPosId } from "@/lib/menu-group-dedup";

export async function POST() {
  try {
    const supabase = getServiceClient();
    const result = await dedupeMenuGroupsByPosId(supabase);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[catalog/menu-groups/dedupe] POST failed", error);
    return NextResponse.json({ error: "Unable to remove duplicate menu groups" }, { status: 500 });
  }
}
