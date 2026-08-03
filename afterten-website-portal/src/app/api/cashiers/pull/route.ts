import { NextResponse } from "next/server";
import { cleanText, isUuid } from "@/lib/cashiers";
import { getFirestoreOutlet, queueFirestoreCashierPull } from "@/lib/firestore-cashiers";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const outletId = cleanText(body.outlet_id, 64);
    if (!isUuid(outletId)) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }

    const outlet = await getFirestoreOutlet(outletId);
    if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
    if (!outlet.has_pos_middleware) {
      return NextResponse.json({ error: "Outlet does not have POS middleware enabled" }, { status: 400 });
    }
    const syncEventId = await queueFirestoreCashierPull(outletId, outlet.name);
    return NextResponse.json({
      ok: true,
      sync_event_id: syncEventId,
      cloud_backend: "firebase",
      message: "Pull cashiers queued. Middleware will sync MintPOS cashiers into the portal on the next cycle.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to queue cashier pull";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
