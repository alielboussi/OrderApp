import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreTransferOrders } from "@/lib/firestore-transfer-orders";
import { isTransferOrderOnDate } from "@/lib/transfer-order-dates";
import { getServiceClient } from "@/lib/supabase-server";
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

    if (useFirebaseBackend()) {
      const { orders, totals } = await listFirestoreTransferOrders({ date, outletId });
      return NextResponse.json({ orders, totals, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const start = new Date(`${date}T00:00:00`);
    start.setDate(start.getDate() - 1);
    const end = new Date(`${date}T00:00:00`);
    end.setDate(end.getDate() + 2);

    let query = supabase
      .from("orders")
      .select(
        "id,order_number,created_at,status,outlet_id,outlets(name),employee_signed_name,employee_signature_path,employee_signed_at,supervisor_signed_name,supervisor_signature_path,supervisor_signed_at,driver_signed_name,driver_signature_path,driver_signed_at,offloader_signed_name,offloader_signature_path,offloader_signed_at,created_by",
      )
      .is("source_event_id", null)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    if (outletId && outletId !== "all") {
      query = query.eq("outlet_id", outletId);
    }

    const { data, error: ordersError } = await query;
    if (ordersError) throw ordersError;

    const orders = ((data ?? []) as OrderRow[])
      .filter((row) => isTransferOrderOnDate(row.created_at, date))
      .map((row) => ({
        ...row,
        outlets: normalizeOutletRelation(row.outlets),
      }));
    const orderIds = orders.map((row) => row.id).filter(Boolean);
    const totals: Record<string, { qty: number; amount: number }> = {};

    if (orderIds.length > 0) {
      const { data: itemRows, error: itemsError } = await supabase
        .from("order_items")
        .select("order_id,qty,cost,amount")
        .in("order_id", orderIds);
      if (itemsError) throw itemsError;

      (itemRows as OrderItemRow[]).forEach((row) => {
        const qty = row.qty ?? 0;
        const amount = row.amount ?? (row.cost ?? 0) * qty;
        const existing = totals[row.order_id] ?? { qty: 0, amount: 0 };
        existing.qty += qty;
        existing.amount += amount;
        totals[row.order_id] = existing;
      });
    }

    return NextResponse.json({ orders, totals });
  } catch (error) {
    console.error("[outlet-orders] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet orders" }, { status: 500 });
  }
}
