import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { isMiddlewareCatalogSyncOutlet, isPosDeductionProgrammingOutlet, isPosMiddlewareOutlet } from "@/lib/outletScope";
import { isHeartbeatMonitoredOutlet } from "@/app/Warehouse_Backoffice/middlewareMonitorShared";

type OutletRow = {
  id: string;
  name?: string | null;
  code?: string | null;
  active?: boolean | null;
  channel?: string | null;
  has_pos_middleware?: boolean | null;
  default_sales_warehouse_id?: string | null;
};

type Outlet = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  channel: string | null;
  has_pos_middleware: boolean | null;
  default_sales_warehouse_id: string | null;
};

function mapOutlet(row: OutletRow): Outlet {
  return {
    id: row.id,
    name: (row.name ?? "Outlet").trim(),
    code: row.code ?? null,
    active: Boolean(row.active ?? false),
    channel: row.channel ?? null,
    has_pos_middleware: row.has_pos_middleware ?? null,
    default_sales_warehouse_id: row.default_sales_warehouse_id ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope")?.trim().toLowerCase() || null;

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("outlets")
      .select("id,name,code,active,channel,has_pos_middleware,default_sales_warehouse_id")
      .order("name");
    if (error) throw error;

    let outlets = Array.isArray(data)
      ? data
          .map(mapOutlet)
          .filter((outlet, index, list) => outlet.id && index === list.findIndex((entry) => entry.id === outlet.id))
      : [];

    if (scope === "selling") {
      outlets = outlets.filter((outlet) => isPosMiddlewareOutlet(outlet));
    } else if (scope === "pos-deductions") {
      outlets = outlets.filter((outlet) => isPosDeductionProgrammingOutlet(outlet));
    } else if (scope === "middleware" || scope === "catalog-sync") {
      outlets = outlets.filter((outlet) => isMiddlewareCatalogSyncOutlet(outlet));
    } else if (scope === "heartbeat") {
      outlets = outlets.filter((outlet) => isHeartbeatMonitoredOutlet(outlet));
    }

    return NextResponse.json({ outlets });
  } catch (error) {
    console.error("[outlets] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlets" }, { status: 500 });
  }
}

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const updatesInput: Array<{ id?: unknown; default_sales_warehouse_id?: unknown }> = Array.isArray(body?.updates)
      ? body.updates
      : body?.id
        ? [body]
        : [];

    if (!updatesInput.length) {
      return NextResponse.json({ error: "No outlet updates supplied" }, { status: 400 });
    }

    const updates = updatesInput
      .map((row) => ({ id: cleanUuid(row.id), default_sales_warehouse_id: cleanUuid(row.default_sales_warehouse_id) }))
      .filter((row) => row.id);

    if (!updates.length) {
      return NextResponse.json({ error: "No valid outlet ids supplied" }, { status: 400 });
    }

    const supabase = getServiceClient();
    for (const entry of updates) {
      const { error } = await supabase
        .from("outlets")
        .update({ default_sales_warehouse_id: entry.default_sales_warehouse_id })
        .eq("id", entry.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (error) {
    console.error("[outlets] PUT failed", error);
    return NextResponse.json({ error: "Unable to save outlets" }, { status: 500 });
  }
}
