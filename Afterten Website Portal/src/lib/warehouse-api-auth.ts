import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type WarehouseAdminActor = {
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

export async function requireWarehouseAdmin(
  request: Request,
): Promise<{ ok: true; actor: WarehouseAdminActor } | { ok: false; response: NextResponse }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: canManage, error: rpcError } = await supabase.rpc("warehouse_can_view_audit_logs");
  if (rpcError || canManage !== true) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    actor: {
      userId: userData.user.id,
      email: userData.user.email ?? null,
    },
  };
}
