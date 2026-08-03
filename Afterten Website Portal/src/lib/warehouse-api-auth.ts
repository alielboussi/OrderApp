import { createClient } from "@supabase/supabase-js";
import { getAuth } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { ensureFirebaseAdmin } from "@/lib/firebase-server";
import { getFirestoreWarehouseAuthAccount, warehouseAuthAccountCanViewLogs } from "@/lib/firestore-warehouse-auth";
import { canViewWarehouseAuditLogs } from "@/lib/warehouse-audit";

export type WarehouseAuthActor = {
  userId: string;
  email: string | null;
};

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

export async function requireWarehouseAuth(
  request: Request,
): Promise<{ ok: true; actor: WarehouseAuthActor } | { ok: false; response: NextResponse }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (useFirebaseBackend()) {
    try {
      ensureFirebaseAdmin();
      const decoded = await getAuth().verifyIdToken(token);
      return {
        ok: true,
        actor: {
          userId: decoded.uid,
          email: decoded.email ?? null,
        },
      };
    } catch {
      return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
  }

  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return {
    ok: true,
    actor: {
      userId: userData.user.id,
      email: userData.user.email ?? null,
    },
  };
}

export async function requireWarehouseAdmin(
  request: Request,
): Promise<{ ok: true; actor: WarehouseAuthActor } | { ok: false; response: NextResponse }> {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth;

  if (useFirebaseBackend()) {
    const account = await getFirestoreWarehouseAuthAccount(auth.actor.userId);
    const canManage =
      (account ? warehouseAuthAccountCanViewLogs(account) : false) ||
      canViewWarehouseAuditLogs(auth.actor.userId, auth.actor.email);
    if (!canManage) {
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return auth;
  }

  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()}` },
    },
  });

  const { data: canManage, error: rpcError } = await supabase.rpc("warehouse_can_view_audit_logs");
  if (
    rpcError ||
    (canManage !== true && !canViewWarehouseAuditLogs(auth.actor.userId, auth.actor.email))
  ) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return auth;
}
