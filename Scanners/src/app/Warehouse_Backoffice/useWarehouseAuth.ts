"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const allowedRoleId = "6b9e657a-6131-4a0b-8afa-0ce260f8ed0c";
const allowedSlugLower = "administrator";
const allowedUserIds = new Set(["8d4feee9-c61b-44e2-80e9-fa264075fca3"]);

let browserClient: SupabaseClient | null = null;

function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase URL and anon key are required");
  }
  if (!browserClient) {
    browserClient = createClient(url, anon, { auth: { persistSession: true } });
  }
  return browserClient;
}

function isAllowed(session: Session | null): boolean {
  const user = session?.user;
  if (!user) return false;
  if (allowedUserIds.has(user.id ?? "")) return true;
  const meta = { ...(user.app_metadata || {}), ...(user.user_metadata || {}) } as Record<string, unknown>;
  const roleId = String(meta.role_id ?? meta.roleId ?? meta.role ?? "").trim();
  const roleSlug = String(meta.role_slug ?? meta.roleSlug ?? meta.role ?? "").trim().toLowerCase();
  return roleId == allowedRoleId || roleSlug === allowedSlugLower;
}

export function useWarehouseAuth() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserClient(), []);
  const [status, setStatus] = useState<"checking" | "ok" | "redirecting">("checking");

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session || !isAllowed(data.session)) {
          await supabase.auth.signOut();
          if (active) {
            setStatus("redirecting");
            router.replace("/Warehouse_Backoffice/login");
          }
          return;
        }
        if (active) setStatus("ok");
      } catch {
        if (active) {
          setStatus("redirecting");
          router.replace("/Warehouse_Backoffice/login");
        }
      }
    };
    verify();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  return { status };
}
