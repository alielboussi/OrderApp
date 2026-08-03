import { NextResponse } from "next/server";
import { listFirestoreOutletWarehouseLinks } from "@/lib/firestore-outlet-warehouses";
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

    const links = await listFirestoreOutletWarehouseLinks({ outletId, scope });
return NextResponse.json({ links, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet warehouses" }, { status: 500 });
  }
}
