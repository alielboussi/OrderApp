"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import DashboardStatsPanel from "./DashboardStatsPanel";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#outlet-live-balances") {
      router.replace("/Warehouse_Backoffice/outlet-live-balances");
    }
  }, [router]);

  if (status !== "ok") {
    return null;
  }

  return (
    <div>
      <DashboardStatsPanel />
    </div>
  );
}
