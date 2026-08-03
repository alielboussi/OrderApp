import { NextRequest, NextResponse } from "next/server";
import { deleteFirestoreTransferOrder } from "@/lib/firestore-transfer-orders";
import { getTransferOrderDetail } from "@/lib/transfer-order-detail";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export async function GET(
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

    const detail = await getTransferOrderDetail(trimmedOrderId);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...detail,
      cloud_backend: "firebase",
    });
  } catch (error) {
    console.error("[outlet-orders/detail] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet order detail" }, { status: 500 });
  }
}

export async function DELETE(
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

    await deleteFirestoreTransferOrder(trimmedOrderId);
return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-orders/delete] DELETE failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete order" },
      { status: 500 },
    );
  }
}
