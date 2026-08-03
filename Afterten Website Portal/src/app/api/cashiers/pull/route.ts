import { NextResponse } from "next/server";
import { cleanText, enqueueCashierSyncEvent, isUuid } from "@/lib/cashiers";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { getFirestoreOutlet, queueFirestoreCashierPull } from "@/lib/firestore-cashiers";
import { getServiceClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const outletId = cleanText(body.outlet_id, 64);
    if (!isUuid(outletId)) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }

    if (useFirebaseBackend()) {
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
    }

    const supabase = getServiceClient();
    const { data: outlet, error: outletError } = await supabase
      .from("outlets")
      .select("id,name,has_pos_middleware")
      .eq("id", outletId)
      .maybeSingle();
    if (outletError) throw outletError;
    if (!outlet) {
      return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
    }
    if (!outlet.has_pos_middleware) {
      return NextResponse.json({ error: "Outlet does not have POS middleware enabled" }, { status: 400 });
    }

    const syncEventId = await enqueueCashierSyncEvent(supabase, {
      outletId,
      action: "pull",
      payload: {
        requested_at: new Date().toISOString(),
        outlet_name: outlet.name,
      },
    });

    return NextResponse.json({
      ok: true,
      sync_event_id: syncEventId,
      message: "Pull cashiers queued. Middleware will sync MintPOS cashiers into the portal on the next cycle.",
    });
  } catch (error) {
    if (isMissingRelationError(error as { code?: string; message?: string }, "outlet_cashier_sync_events")) {
      return NextResponse.json(
        { error: "Cashier sync is not configured yet — apply supabase/migrations/20260729_outlet_cashiers.sql" },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Unable to queue cashier pull";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
