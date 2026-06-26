"use client";

import { useWarehouseAuth } from "../../useWarehouseAuth";
import OutletCatalogPushPanel from "../../OutletCatalogPushPanel";

export default function OutletCatalogPushPage() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return <OutletCatalogPushPanel />;
}
