import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  isOutletDeductionWarehouse,
  isPosMiddlewareOutlet,
  outletCandidateFromLink,
  outletWarehouseLabel,
} from "@/lib/outletScope";
import type { OutletWarehouseLink } from "@/lib/firestore-outlet-warehouses";

function isSellingOutletWarehouseLink(row: {
  outlet_id: string;
  warehouse_id: string;
  outlet_name: string;
  warehouse_name: string;
  warehouse_scope: string | null;
  outlet: {
    id: string;
    name: string | null;
    channel?: string | null;
    has_pos_middleware?: boolean | null;
  } | null;
  warehouse: { id: string; name: string | null; warehouse_scope?: string | null };
}): boolean {
  if (!isPosMiddlewareOutlet(outletCandidateFromLink(row))) return false;
  return isOutletDeductionWarehouse({
    name: row.warehouse?.name ?? row.warehouse_name,
    warehouse_scope: row.warehouse?.warehouse_scope ?? row.warehouse_scope,
  });
}

export async function listSupabaseOutletWarehouseLinks(options?: {
  outletId?: string | null;
  scope?: string | null;
}): Promise<OutletWarehouseLink[]> {
  const supabase = getSupabaseAdmin();
  const outletId = options?.outletId?.trim() || null;
  const scope = options?.scope?.trim().toLowerCase() || null;

  let query = supabase
    .from("v_outlet_warehouses")
    .select("outlet_id,outlet_name,outlet_code,warehouse_id,warehouse_name,warehouse_scope");
  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }
  const { data: linkRows, error: linkError } = await query;
  if (linkError) throw new Error(linkError.message);

  const { data: outlets, error: outletsError } = await supabase
    .from("outlets")
    .select("id,name,channel,has_pos_middleware,active");
  if (outletsError) throw new Error(outletsError.message);

  const outletMap = new Map(
    (outlets ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        name: typeof row.name === "string" ? row.name : null,
        channel: typeof row.channel === "string" ? row.channel : null,
        has_pos_middleware: row.has_pos_middleware === true,
      },
    ]),
  );

  let links = (linkRows ?? [])
    .map((row) => {
      const outlet_id = String(row.outlet_id);
      const warehouse_id = String(row.warehouse_id);
      const outlet = outletMap.get(outlet_id) ?? null;
      const outlet_name = String(row.outlet_name ?? outlet?.name ?? "Outlet");
      const warehouse_name = String(row.warehouse_name ?? "Warehouse");
      const warehouse_scope = typeof row.warehouse_scope === "string" ? row.warehouse_scope : null;
      return {
        outlet_id,
        outlet_name,
        warehouse_id,
        warehouse_name,
        warehouse_scope,
        outlet,
        warehouse: { id: warehouse_id, name: warehouse_name, warehouse_scope },
      };
    })
    .filter((row) => row.outlet_id && row.warehouse_id);

  if (scope === "outlet") {
    links = links.filter((row) => isSellingOutletWarehouseLink(row));
  }

  links.sort((a, b) =>
    (a.outlet_name ?? "").localeCompare(b.outlet_name ?? "", undefined, { sensitivity: "base" }),
  );

  return links.map((row) => ({
    outlet_id: row.outlet_id,
    outlet_name: row.outlet_name,
    warehouse_id: row.warehouse_id,
    warehouse_name: row.warehouse_name,
    warehouse_scope: row.warehouse_scope,
    display_name: outletWarehouseLabel(row, links),
  }));
}
