"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";

export function useWarehouseAuth() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [status, setStatus] = useState<"checking" | "ok" | "redirecting">("checking");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        const currentUserId = session?.user?.id ?? null;
        setUserId(currentUserId);

        if (error || !session?.user) {
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

  return {
    status,
    readOnly: false,
    deleteDisabled: false,
    canViewLogs: true,
    userId,
  };
}
