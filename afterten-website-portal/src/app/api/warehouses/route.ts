import { NextResponse } from "next/server";
import {
  filterFirestoreWarehousesByScope,
  listFirestoreOutletWarehouseIds,
  listFirestoreWarehouses,
} from "@/lib/firestore-warehouses";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeInactiveParam = url.searchParams.get("include_inactive");
    const includeInactive = includeInactiveParam === "1" || includeInactiveParam === "true";
    const scope = url.searchParams.get("scope")?.trim().toLowerCase() || null;
    const outletId = url.searchParams.get("outlet_id")?.trim() || null;
    const lockedIdCandidates = [
      ...url.searchParams.getAll("locked_id"),
      url.searchParams.get("fromLockedId"),
      url.searchParams.get("from_locked_id"),
      url.searchParams.get("locked_from"),
      url.searchParams.get("lockedWarehouseId"),
      url.searchParams.get("lockedWarehouse"),
      url.searchParams.get("locked_source_id"),
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const lockedIds = Array.from(new Set(lockedIdCandidates.map((value) => value.trim())));

    let normalized = await listFirestoreWarehouses({ includeInactive, lockedIds });

    if (scope === "outlet") {
      const outletWarehouseIds = new Set(await listFirestoreOutletWarehouseIds(outletId));
      normalized = filterFirestoreWarehousesByScope(normalized, outletWarehouseIds);
    } else if (scope === "hub") {
      const outletIds = new Set(await listFirestoreOutletWarehouseIds());
      normalized = normalized.filter((w) => !outletIds.has(w.id));
    }

    return NextResponse.json({ warehouses: normalized, cloud_backend: "firebase" });
  } catch (error) {
    console.error("warehouses api failed", error);
    return NextResponse.json({ error: "Unable to load warehouses" }, { status: 500 });
  }
}
