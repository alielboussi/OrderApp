"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { requireActiveWarehouseAccount } from "@/lib/warehouse-account";
import { canViewWarehouseAuditLogs } from "@/lib/warehouse-audit";

export function useWarehouseAuth() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [status, setStatus] = useState<"checking" | "ok" | "redirecting">("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [canViewLogs, setCanViewLogs] = useState(false);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        const currentUserId = session?.user?.id ?? null;
        setUserId(currentUserId);
        setUserEmail(session?.user?.email ?? null);

        if (error || !session?.user) {
          await supabase.auth.signOut();
          if (active) {
            setCanViewLogs(false);
            setStatus("redirecting");
            router.replace("/Warehouse_Backoffice/login");
          }
          return;
        }

        const approval = await requireActiveWarehouseAccount(supabase);
        if (!approval.ok) {
          if (active) {
            setCanViewLogs(false);
            setStatus("redirecting");
            router.replace(
              `/Warehouse_Backoffice/login?error=${encodeURIComponent(approval.message)}`,
            );
          }
          return;
        }

        const { data: canView, error: auditError } = await supabase.rpc("warehouse_can_view_audit_logs");
        if (!active) return;
        setCanViewLogs(
          canViewWarehouseAuditLogs(currentUserId) || (!auditError && canView === true),
        );
        setStatus("ok");
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
    canViewLogs,
    userId,
    userEmail,
  };
}
