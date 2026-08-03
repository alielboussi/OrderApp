"use client";

import { useWarehouseAuth } from "./useWarehouseAuth";
import DashboardStatsPanel from "./DashboardStatsPanel";

export default function WarehouseBackofficeDashboard() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") {
    return null;
  }

  return (
    <div>
      <DashboardStatsPanel />
    </div>
  );
}
