import { NextRequest, NextResponse } from "next/server";
import { listFirestoreTransferOrders } from "@/lib/firestore-transfer-orders";
import { isTransferOrderOnDate } from "@/lib/transfer-order-dates";
export const dynamic = "force-dynamic";
type OrderRow = {
  id: string;
  order_number: string | null;
  created_at: string | null;
  status: string | null;
  outlet_id: string | null;
  outlets?: { name?: string | null } | Array<{ name?: string | null }> | null;
  employee_signed_name?: string | null;
  employee_signature_path?: string | null;
  employee_signature_data?: string | null;
  employee_signed_at?: string | null;
  supervisor_signed_name?: string | null;
  supervisor_signature_path?: string | null;
  supervisor_signed_at?: string | null;
  driver_signed_name?: string | null;
  driver_signature_path?: string | null;
  driver_signature_data?: string | null;
  driver_signed_at?: string | null;
  offloader_signed_name?: string | null;
  offloader_signature_path?: string | null;
  offloader_signature_data?: string | null;
  offloader_signed_at?: string | null;
  created_by?: string | null;
};

type OrderItemRow = {
  order_id: string;
  qty: number | null;
  cost: number | null;
  amount: number | null;
};

function normalizeOutletRelation(
  value: OrderRow["outlets"],
): { name?: string | null } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim();
    const outletId = url.searchParams.get("outlet_id")?.trim() || null;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    const { orders, totals } = await listFirestoreTransferOrders({ date, outletId });
return NextResponse.json({ orders, totals, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-orders] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet orders" }, { status: 500 });
  }
}
