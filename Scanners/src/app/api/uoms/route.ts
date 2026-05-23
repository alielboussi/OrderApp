import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type UomRow = { code: string; label: string | null };

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("uom_options")
      .select("code,label")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    if (error) throw error;

    const rows = (data as UomRow[] | null) ?? [];
    const items = rows
      .map((row) => ({
        value: row.code,
        label: row.label ?? row.code,
      }))
      .filter((row) => row.value && row.label);

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("uom options load failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load uoms" }, { status: 500 });
  }
}
