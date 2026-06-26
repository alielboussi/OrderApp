"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { requireActiveWarehouseAccount } from "@/lib/warehouse-account";

export default function WarehouseAuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  useEffect(() => {
    let active = true;

    const finish = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDescription = url.searchParams.get("error_description");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) {
            throw new Error("No session returned from Google sign-in.");
          }
        }

        const approval = await requireActiveWarehouseAccount(supabase);
        if (!approval.ok) {
          throw new Error(approval.message);
        }

        if (!active) return;
        router.replace("/Warehouse_Backoffice");
      } catch (err) {
        if (!active) return;
        const text = err instanceof Error ? err.message : "Google sign-in failed";
        router.replace(`/Warehouse_Backoffice/login?error=${encodeURIComponent(text)}`);
      }
    };

    finish();
    return () => {
      active = false;
    };
  }, [router, supabase]);

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
