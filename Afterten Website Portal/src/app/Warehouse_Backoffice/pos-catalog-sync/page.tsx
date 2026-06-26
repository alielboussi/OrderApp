"use client";

import { useWarehouseAuth } from "../useWarehouseAuth";
import PosCatalogSyncPanel from "../PosCatalogSyncPanel";

export default function PosCatalogSyncPage() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return (
    <div>
      <PosCatalogSyncPanel />
    </div>
  );
}
