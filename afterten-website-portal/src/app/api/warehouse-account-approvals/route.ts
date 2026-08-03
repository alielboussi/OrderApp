import { NextResponse } from "next/server";
import {
  approveFirestoreWarehouseAuthAccount,
  declineFirestoreWarehouseAuthAccount,
  listPendingFirestoreWarehouseAuthAccounts,
} from "@/lib/firestore-warehouse-auth";
import { requireWarehouseAdmin } from "@/lib/warehouse-api-auth";

type WarehouseAuthAccountRow = {
  user_id: string;
  email: string | null;
  active: boolean;
  created_at: string;
  activated_at: string | null;
};

export async function GET(request: Request) {
  const auth = await requireWarehouseAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const accounts = await listPendingFirestoreWarehouseAuthAccounts();
return NextResponse.json({ accounts, cloud_backend: "firebase" });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pending accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireWarehouseAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }
    if (action !== "approve" && action !== "decline") {
      return NextResponse.json({ error: "action must be approve or decline" }, { status: 400 });
    }
    if (action === "decline" && userId === auth.actor.userId) {
      return NextResponse.json({ error: "You cannot decline your own account" }, { status: 400 });
    }

    if (action === "approve") {
  await approveFirestoreWarehouseAuthAccount(userId);
} else {
  await declineFirestoreWarehouseAuthAccount(userId);
}
return NextResponse.json({ ok: true, action, user_id: userId });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
