import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreOutletWarehouseLinks } from "@/lib/firestore-outlet-warehouses";
import { getServiceClient } from "@/lib/supabase-server";
import {
  isOutletDeductionWarehouse,
  isPosMiddlewareOutlet,
  outletCandidateFromLink,
  outletWarehouseLabel,
} from "@/lib/outletScope";

type LinkRow = {
  outlet_id: string;
  warehouse_id: string;
  outlets: Array<{
    id: string;
    name: string | null;
    code?: string | null;
    active?: boolean | null;
    channel?: string | null;
    has_pos_middleware?: boolean | null;
  }> | null;
  warehouses: Array<{ id: string; name: string | null; warehouse_scope?: string | null }> | null;
};

/** Canonical filter for selling outlet warehouses (movement reports, etc.). */
function isSellingOutletWarehouseLink(row: {
  outlet_id: string;
  warehouse_id: string;
  outlet_name: string;
  warehouse_name: string;
  warehouse_scope: string | null;
  outlet: LinkRow["outlets"] extends Array<infer T> | null ? T | null : null;
  warehouse: LinkRow["warehouses"] extends Array<infer T> | null ? T | null : null;
}): boolean {
  if (!isPosMiddlewareOutlet(outletCandidateFromLink(row))) return false;
  return isOutletDeductionWarehouse({
    name: row.warehouse?.name ?? row.warehouse_name,
    warehouse_scope: row.warehouse?.warehouse_scope ?? row.warehouse_scope,
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outlet_id")?.trim();
    const scope = url.searchParams.get("scope")?.trim().toLowerCase() || null;

    if (useFirebaseBackend()) {
      const links = await listFirestoreOutletWarehouseLinks({ outletId, scope });
      return NextResponse.json({ links, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from("outlet_warehouses")
      .select("outlet_id,warehouse_id,outlets(id,name,code,active,channel,has_pos_middleware),warehouses(id,name,warehouse_scope)")
      .order("outlet_id");

    if (outletId) query = query.eq("outlet_id", outletId);

    const { data, error } = await query;
    if (error) throw error;

    let links = ((data as LinkRow[]) ?? [])
      .map((row) => {
        const outlet = row.outlets?.[0] ?? null;
        const warehouse = row.warehouses?.[0] ?? null;
        return {
          outlet_id: row.outlet_id,
          outlet_name: outlet?.name ?? "Outlet",
          warehouse_id: row.warehouse_id,
          warehouse_name: warehouse?.name ?? "Warehouse",
          warehouse_scope: warehouse?.warehouse_scope ?? null,
          outlet,
          warehouse,
        };
      })
      .filter((row) => row.outlet_id && row.warehouse_id);

    if (scope === "outlet") {
      links = links.filter((row) => isSellingOutletWarehouseLink(row));
    }

    links.sort((a, b) =>
      (a.outlet_name ?? "").localeCompare(b.outlet_name ?? "", undefined, { sensitivity: "base" })
    );

    return NextResponse.json({
      links: links.map((row) => ({
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        warehouse_scope: row.warehouse_scope,
        display_name: outletWarehouseLabel(row, links),
      })),
    });
  } catch (error) {
    console.error("[outlet-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet warehouses" }, { status: 500 });
  }
}
