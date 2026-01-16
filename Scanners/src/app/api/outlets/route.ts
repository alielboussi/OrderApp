import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type OutletRow = {
  id: string;
  name?: string | null;
  code?: string | null;
  active?: boolean | null;
};

type Outlet = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
};

function mapOutlet(row: OutletRow): Outlet {
  return {
    id: row.id,
    name: (row.name ?? "Outlet").trim(),
    code: row.code ?? null,
    active: Boolean(row.active ?? false),
  };
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.from("outlets").select("id,name,code,active").order("name");
    if (error) throw error;

    const outlets = Array.isArray(data)
      ? data
          .map(mapOutlet)
          .filter((outlet, index, list) => outlet.id && index === list.findIndex((entry) => entry.id === outlet.id))
      : [];

    return NextResponse.json({ outlets });
  } catch (error) {
    console.error("[outlets] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlets" }, { status: 500 });
  }
}
