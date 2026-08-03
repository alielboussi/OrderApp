import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  ensureFirestoreWarehouseAuthAccount,
  warehouseAuthAccountCanViewLogs,
} from "@/lib/firestore-warehouse-auth";
import { WAREHOUSE_PENDING_APPROVAL_MESSAGE } from "@/lib/warehouse-account";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";
import { getServiceClient } from "@/lib/supabase-server";
import { canViewWarehouseAuditLogs } from "@/lib/warehouse-audit";

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is required");
  return url;
}

function getAnonKey(): string {
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) throw new Error("SUPABASE_ANON_KEY is required");
  return anon;
}

export async function GET(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    if (useFirebaseBackend()) {
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
        cloud_backend: "firebase",
      });
    }

    const supabase = getServiceClient();
    const { data: account, error: accountError } = await supabase
      .from("warehouse_auth_accounts")
      .select("user_id,email,active,created_at,activated_at")
      .eq("user_id", auth.actor.userId)
      .maybeSingle();

    if (accountError) throw accountError;

    let active = account?.active === true;
    if (!account) {
      const { error: insertError } = await supabase.from("warehouse_auth_accounts").insert({
        user_id: auth.actor.userId,
        email: auth.actor.email,
        active: false,
      });
      if (insertError && !insertError.message.includes("duplicate")) {
        throw insertError;
      }
      active = false;
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
    const supabaseUser = createClient(getSupabaseUrl(), getAnonKey(), {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: canViewRpc, error: rpcError } = await supabaseUser.rpc("warehouse_can_view_audit_logs");
    const canViewLogs =
      canViewWarehouseAuditLogs(auth.actor.userId, auth.actor.email) ||
      (!rpcError && canViewRpc === true);

    return NextResponse.json({
      user_id: auth.actor.userId,
      email: auth.actor.email,
      active,
      can_view_logs: canViewLogs,
      pending_message: active ? null : WAREHOUSE_PENDING_APPROVAL_MESSAGE,
    });
  } catch (error) {
    console.error("[warehouse-auth/me] GET failed", error);
    return NextResponse.json({ error: "Unable to load auth profile" }, { status: 500 });
  }
}
