import { NextResponse } from "next/server";
import { enqueueCashierSyncEvent, isUuid } from "@/lib/cashiers";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { deleteFirestoreCashier } from "@/lib/firestore-cashiers";
import { getServiceClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cashierId = id?.trim() ?? "";
    if (!isUuid(cashierId)) {
      return NextResponse.json({ error: "Invalid cashier id" }, { status: 400 });
    }

    if (useFirebaseBackend()) {
      const result = await deleteFirestoreCashier(cashierId);
      return NextResponse.json({ ...result, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data: cashier, error: loadError } = await supabase
      .from("outlet_cashiers")
      .select("id,outlet_id,name,username,pos_user_id,sync_status,active")
      .eq("id", cashierId)
      .maybeSingle();
    if (loadError) {
      if (isMissingRelationError(loadError, "outlet_cashiers")) {
        return NextResponse.json({ error: "Cashier storage is not configured yet" }, { status: 503 });
      }
      throw loadError;
    }
    if (!cashier) {
      return NextResponse.json({ error: "Cashier not found" }, { status: 404 });
    }
    if (cashier.sync_status === "deleted") {
      return NextResponse.json({ error: "Cashier is already deleted" }, { status: 409 });
    }
    if (cashier.sync_status === "pending_delete") {
      return NextResponse.json({ error: "Cashier delete is already queued" }, { status: 409 });
    }

    if (!cashier.pos_user_id) {
      return NextResponse.json(
        { error: "Cashier has not synced to MintPOS yet. Wait for middleware sync or pull cashiers first." },
        { status: 409 },
      );
    }

    const { error: updateError } = await supabase
      .from("outlet_cashiers")
      .update({ sync_status: "pending_delete", updated_at: new Date().toISOString() })
      .eq("id", cashierId);
    if (updateError) throw updateError;

    const syncEventId = await enqueueCashierSyncEvent(supabase, {
      outletId: cashier.outlet_id,
      cashierId: cashier.id,
      action: "delete",
      payload: {
        pos_user_id: cashier.pos_user_id,
        username: cashier.username,
        name: cashier.name,
      },
    });

    return NextResponse.json({
      ok: true,
      cashier_id: cashier.id,
      sync_event_id: syncEventId,
      message: "Cashier delete queued. Middleware will remove Rights rows first, then delete the MintPOS user.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete cashier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
