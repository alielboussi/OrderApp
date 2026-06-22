"use client";

import { useWarehouseAuth } from "../useWarehouseAuth";
import OutletLiveBalancesPanel from "../OutletLiveBalancesPanel";

export default function OutletLiveBalancesPage() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return <OutletLiveBalancesPanel />;
}
