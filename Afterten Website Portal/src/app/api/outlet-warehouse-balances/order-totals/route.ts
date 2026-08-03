import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { getFirestoreTransferOrderTotals } from "@/lib/firestore-transfer-orders";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletIds = url.searchParams.getAll("outlet_id").filter(Boolean);
    const orderDate = url.searchParams.get("date");

    if (!outletIds.length || !orderDate) {
      return NextResponse.json({ count: 0, qty: 0, amount: 0 });
    }

    if (useFirebaseBackend()) {
      const totals = await getFirestoreTransferOrderTotals({ outletIds, date: orderDate });
      return NextResponse.json({ ...totals, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const start = new Date(orderDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .in("outlet_id", outletIds)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    if (ordersError) throw ordersError;
    const orderIds = (ordersData || []).map((row) => row.id).filter(Boolean) as string[];

    if (orderIds.length === 0) {
      return NextResponse.json({ count: 0, qty: 0, amount: 0 });
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id,qty,cost,amount")
      .in("order_id", orderIds);

    if (itemsError) throw itemsError;

    const totals = (itemsData || []).reduce(
      (acc, row) => {
        const qty = typeof row.qty === "number" ? row.qty : 0;
        const cost = typeof row.cost === "number" ? row.cost : 0;
        const amount = typeof row.amount === "number" ? row.amount : cost * qty;
        acc.qty += qty;
        acc.amount += amount;
        return acc;
      },
      { count: orderIds.length, qty: 0, amount: 0 },
    );

    return NextResponse.json(totals);
  } catch (error) {
    console.error("[outlet-warehouse-balances/order-totals] GET failed", error);
    return NextResponse.json({ error: "Unable to load order totals" }, { status: 500 });
  }
}
