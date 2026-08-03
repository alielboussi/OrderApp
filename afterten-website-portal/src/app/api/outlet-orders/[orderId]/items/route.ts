import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  listFirestoreTransferOrderItems,
  updateFirestoreTransferOrderItems,
  type UpdateTransferOrderItemInput,
} from "@/lib/firestore-transfer-orders";
import { getServiceClient } from "@/lib/supabase-server";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await context.params;
    if (!orderId?.trim()) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    if (useFirebaseBackend()) {
      const items = await listFirestoreTransferOrderItems(orderId.trim());
      return NextResponse.json({ items, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("order_items")
      .select("id,order_id,product_id,variant_key,name,receiving_uom,consumption_uom,qty,cost,amount,package_contains")
      .eq("order_id", orderId.trim());

    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error("[outlet-orders/items] GET failed", error);
    return NextResponse.json({ error: "Unable to load order items" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { orderId } = await context.params;
    const trimmedOrderId = orderId?.trim();
    if (!trimmedOrderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const body = (await request.json()) as { items?: UpdateTransferOrderItemInput[] };
    const items = body.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one order line is required" }, { status: 400 });
    }

    if (!useFirebaseBackend()) {
      return NextResponse.json(
        { error: "Editing outlet orders is only available on the Firebase backend" },
        { status: 501 },
      );
    }

    const supervisorEditedName = auth.actor.email?.trim() || "Warehouse supervisor";
    const savedItems = await updateFirestoreTransferOrderItems(
      trimmedOrderId,
      items,
      supervisorEditedName,
    );
    const totals = savedItems.reduce(
      (acc, item) => {
        const qty = Number(item.qty ?? 0);
        const amount = Number(item.amount ?? (item.cost ?? 0) * qty);
        acc.qty += qty;
        acc.amount += amount;
        return acc;
      },
      { qty: 0, amount: 0 },
    );

    return NextResponse.json({
      ok: true,
      items: savedItems,
      totals,
      cloud_backend: "firebase",
    });
  } catch (error) {
    console.error("[outlet-orders/items] PATCH failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save order changes" },
      { status: 500 },
    );
  }
}