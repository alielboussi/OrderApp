"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getWarehouseAuthSession,
  warehouseCompleteGoogleCallback,
  warehouseSignOut,
} from "@/lib/warehouse-auth-client";
import { requireActiveWarehouseAccountFromToken } from "@/lib/warehouse-account-api";

export default function WarehouseAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const finish = async () => {
      try {
        await warehouseCompleteGoogleCallback();

        const session = await getWarehouseAuthSession();
        if (!session) {
          throw new Error("No session returned from Google sign-in.");
        }

        const approval = await requireActiveWarehouseAccountFromToken(session.accessToken);
        if (!approval.ok) {
          await warehouseSignOut();
          throw new Error(approval.message);
        }

        if (!active) return;
        router.replace("/Warehouse_Backoffice");
      } catch (err) {
        if (!active) return;
        await warehouseSignOut();
        const text = err instanceof Error ? err.message : "Google sign-in failed";
        router.replace(`/Warehouse_Backoffice/login?error=${encodeURIComponent(text)}`);
      }
    };

    finish();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111",
      }}
    >
      <p>Signing you in with Google...</p>
    </div>
  );
}
