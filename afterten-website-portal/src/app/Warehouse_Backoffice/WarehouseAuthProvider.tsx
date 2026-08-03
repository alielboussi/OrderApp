"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  getWarehouseAuthSession,
  warehouseSignOut,
} from "@/lib/warehouse-auth-client";
import { requireActiveWarehouseAccountFromToken } from "@/lib/warehouse-account-api";

type WarehouseAuthState = {
  status: "checking" | "ok" | "redirecting";
  readOnly: boolean;
  deleteDisabled: boolean;
  canViewLogs: boolean;
  userId: string | null;
  userEmail: string | null;
};

const WarehouseAuthContext = createContext<WarehouseAuthState | null>(null);

export function WarehouseAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<WarehouseAuthState["status"]>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [canViewLogs, setCanViewLogs] = useState(false);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const session = await getWarehouseAuthSession();
        if (!session) {
          if (active) {
            setCanViewLogs(false);
            setStatus("redirecting");
            router.replace("/Warehouse_Backoffice/login");
          }
          return;
        }

        setUserId(session.userId);
        setUserEmail(session.email);

        const approval = await requireActiveWarehouseAccountFromToken(session.accessToken);
        if (!approval.ok) {
          await warehouseSignOut();
          if (active) {
            setCanViewLogs(false);
            setStatus("redirecting");
            router.replace(
              `/Warehouse_Backoffice/login?error=${encodeURIComponent(approval.message)}`,
            );
          }
          return;
        }

        if (!active) return;
        setCanViewLogs(approval.profile.can_view_logs);
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
  }, [router]);

  const value = useMemo<WarehouseAuthState>(
    () => ({
      status,
      readOnly: false,
      deleteDisabled: false,
      canViewLogs,
      userId,
      userEmail,
    }),
    [status, canViewLogs, userId, userEmail],
  );

  return <WarehouseAuthContext.Provider value={value}>{children}</WarehouseAuthContext.Provider>;
}

export function useWarehouseAuth(): WarehouseAuthState {
  const context = useContext(WarehouseAuthContext);
  if (!context) {
    throw new Error("useWarehouseAuth must be used within WarehouseAuthProvider");
  }
  return context;
}
