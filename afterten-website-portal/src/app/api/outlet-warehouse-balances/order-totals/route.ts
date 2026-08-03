import { NextRequest, NextResponse } from "next/server";
import { getFirestoreTransferOrderTotals } from "@/lib/firestore-transfer-orders";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletIds = url.searchParams.getAll("outlet_id").filter(Boolean);
    const orderDate = url.searchParams.get("date");

    if (!outletIds.length || !orderDate) {
      return NextResponse.json({ count: 0, qty: 0, amount: 0 });
    }

    const totals = await getFirestoreTransferOrderTotals({ outletIds, date: orderDate });
return NextResponse.json({ ...totals, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-warehouse-balances/order-totals] GET failed", error);
    return NextResponse.json({ error: "Unable to load order totals" }, { status: 500 });
  }
}
