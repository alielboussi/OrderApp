import { NextResponse } from "next/server";
import { cloudBackendMeta } from "@/lib/cloud-backend";
import { listOutletWarehouseLinks } from "@/lib/outlet-warehouses-store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outlet_id")?.trim();
    const scope = url.searchParams.get("scope")?.trim().toLowerCase() || null;

    const links = await listOutletWarehouseLinks({ outletId, scope });
    return NextResponse.json({ links, ...cloudBackendMeta() });
  } catch (error) {
    console.error("[outlet-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet warehouses" }, { status: 500 });
  }
}
