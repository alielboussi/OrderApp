import { NextResponse } from "next/server";
import {
  ensureFirestoreWarehouseAuthAccount,
  warehouseAuthAccountCanViewLogs,
} from "@/lib/firestore-warehouse-auth";
import { WAREHOUSE_PENDING_APPROVAL_MESSAGE } from "@/lib/warehouse-account";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export async function GET(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const account = await ensureFirestoreWarehouseAuthAccount({
      userId: auth.actor.userId,
      email: auth.actor.email,
    });

    return NextResponse.json({
      user_id: account.user_id,
      email: account.email,
      active: account.active,
      can_view_logs: warehouseAuthAccountCanViewLogs(account),
      pending_message: account.active ? null : WAREHOUSE_PENDING_APPROVAL_MESSAGE,
    });
  } catch (error) {
    console.error("[warehouse-auth/me] GET failed", error);
    return NextResponse.json({ error: "Unable to load auth profile" }, { status: 500 });
  }
}
