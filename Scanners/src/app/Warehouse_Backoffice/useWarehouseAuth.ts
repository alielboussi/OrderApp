"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";

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

export function useWarehouseAuth() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [status, setStatus] = useState<"checking" | "ok" | "redirecting">("checking");

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        const allowed = !error && (await isPlatformAdmin(supabase, session));

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

  return { status };
}
