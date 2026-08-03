import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  approveFirestoreWarehouseAuthAccount,
  declineFirestoreWarehouseAuthAccount,
  listPendingFirestoreWarehouseAuthAccounts,
} from "@/lib/firestore-warehouse-auth";
import { requireWarehouseAdmin } from "@/lib/warehouse-api-auth";
import { getServiceClient, hasServiceRoleKey } from "@/lib/supabase-server";

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
    if (useFirebaseBackend()) {
      const accounts = await listPendingFirestoreWarehouseAuthAccounts();
      return NextResponse.json({ accounts, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("warehouse_auth_accounts")
      .select("user_id,email,active,created_at,activated_at")
      .eq("active", false)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      accounts: (data as WarehouseAuthAccountRow[]) ?? [],
    });
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

    if (useFirebaseBackend()) {
      if (action === "approve") {
        await approveFirestoreWarehouseAuthAccount(userId);
      } else {
        await declineFirestoreWarehouseAuthAccount(userId);
      }
      return NextResponse.json({ ok: true, action, user_id: userId });
    }

    const supabase = getServiceClient();

    const { data: existing, error: existingError } = await supabase
      .from("warehouse_auth_accounts")
      .select("user_id,email,active")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (existing.active === true && action === "approve") {
      return NextResponse.json({
        ok: true,
        action,
        user_id: userId,
        message: "Account is already approved",
      });
    }

    if (action === "approve") {
      const { error: updateError } = await supabase
        .from("warehouse_auth_accounts")
        .update({
          active: true,
          activated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        action,
        user_id: userId,
        email: existing.email,
      });
    }

    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        {
          error:
            "Declining accounts requires SUPABASE_SERVICE_ROLE_KEY on the server so auth users can be deleted.",
        },
        { status: 500 },
      );
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return NextResponse.json({
      ok: true,
      action,
      user_id: userId,
      email: existing.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
