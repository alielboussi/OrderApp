import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type ScannerRow = {
  id: string;
  name: string | null;
};

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("scanners")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ scanners: (data ?? []) as ScannerRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load scanners";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
