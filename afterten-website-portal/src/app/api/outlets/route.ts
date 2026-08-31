import { NextResponse } from "next/server";
import {
  isMiddlewareCatalogSyncOutlet,
  isPosMiddlewareOutlet,
  middlewareSalesApiProfileForOutletId,
  MIDDLEWARE_SALES_API_PATHS,
} from "@/lib/outletScope";
import { isHeartbeatMonitoredOutlet } from "@/app/Warehouse_Backoffice/middlewareMonitorShared";
import { cloudBackendMeta } from "@/lib/cloud-backend";
import {
  createOrdersOutlet,
  filterOutletsByScope,
  listOutlets,
  updateOutletDefaultWarehouse,
} from "@/lib/outlets-store";

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
  middleware_sales_api_profile: string | null;
  middleware_sales_api_path: string | null;
};

function mapOutlet(row: OutletRow): Outlet {
  const profile = middlewareSalesApiProfileForOutletId(row.id);
  return {
    id: row.id,
    name: (row.name ?? "Outlet").trim(),
    code: row.code ?? null,
    active: row.active !== false,
    channel: row.channel ?? null,
    has_pos_middleware: row.has_pos_middleware ?? null,
    default_sales_warehouse_id: row.default_sales_warehouse_id ?? null,
    middleware_sales_api_profile: profile,
    middleware_sales_api_path: profile ? MIDDLEWARE_SALES_API_PATHS[profile] : null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope")?.trim().toLowerCase() || null;

    let outlets = (await listOutlets()).sort((a, b) => a.name.localeCompare(b.name));
    outlets = filterOutletsByScope(outlets, scope);
    return NextResponse.json({ outlets, ...cloudBackendMeta() });
    
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

    const validUpdates = updates.filter((row): row is { id: string; default_sales_warehouse_id: string | null } => Boolean(row.id));
    const updated = await updateOutletDefaultWarehouse(validUpdates);
    return NextResponse.json({ ok: true, updated, ...cloudBackendMeta() });
    
  } catch (error) {
    console.error("[outlets] PUT failed", error);
    return NextResponse.json({ error: "Unable to save outlets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const ordersAppEmail = typeof body.orders_app_email === "string" ? body.orders_app_email.trim() : "";
    const ordersAppPassword = typeof body.orders_app_password === "string" ? body.orders_app_password : "";
    const code = typeof body.code === "string" ? body.code.trim() : null;
    const warehouseId =
      typeof body.warehouse_id === "string" && body.warehouse_id.trim() ? body.warehouse_id.trim() : null;

    const created = await createOrdersOutlet({
      name,
      code,
      ordersAppEmail,
      ordersAppPassword,
      warehouseId,
    });

    return NextResponse.json({
      ok: true,
      ...cloudBackendMeta(),
      outlet: created,
      catalog_access_url: `/Warehouse_Backoffice/outlets/catalog-access?outlet_id=${created.outletId}`,
    });
  } catch (error) {
    console.error("[outlets] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create outlet" },
      { status: 500 },
    );
  }
}
