"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";

const READONLY_USER_IDS = [
  "fd52f4c1-2403-4670-bdd6-97b4ca7580aa",
  "a77c117e-3c48-437d-abb5-ed9fc159372f",
];
const BACKOFFICE_ROLE_ID = "de9f2075-9c97-4da1-a2a0-59ed162947e7";

async function isPlatformAdmin(supabase: SupabaseClient, session: Session | null): Promise<boolean> {
  const userId = session?.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (error) {
    // PGRST116 is the PostgREST code for no rows when using single()
    if ((error as { code?: string }).code === "PGRST116") return false;
    throw error;
  }

  return Boolean(data?.user_id);
}

async function hasBackofficeRole(supabase: SupabaseClient, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .eq("role_id", BACKOFFICE_ROLE_ID)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "PGRST116") return false;
    throw error;
  }
  return Boolean(data?.role_id);
}

export function useWarehouseAuth() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [status, setStatus] = useState<"checking" | "ok" | "redirecting">("checking");
  const [readOnly, setReadOnly] = useState(false);
  const [deleteDisabled, setDeleteDisabled] = useState(false);
  const [canViewLogs, setCanViewLogs] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        const currentUserId = session?.user?.id ?? null;
        setUserId(currentUserId);

        const isAdmin = !error && (await isPlatformAdmin(supabase, session));
        const isBackoffice = !error && (await hasBackofficeRole(supabase, currentUserId));
        const isReadOnlyUser = Boolean(currentUserId && READONLY_USER_IDS.includes(currentUserId));
        const allowed = isAdmin || isBackoffice || isReadOnlyUser;
        setReadOnly(isReadOnlyUser);
        setDeleteDisabled(isReadOnlyUser);
        setCanViewLogs(isAdmin || isBackoffice);

        if (!allowed) {
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

  return { status, readOnly, deleteDisabled, canViewLogs, userId };
}
