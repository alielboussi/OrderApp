"use client";

import { useWarehouseAuth } from "../useWarehouseAuth";
import MiddlewareStatusPanel from "../MiddlewareStatusPanel";

export default function MiddlewareHeartbeatPage() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return <MiddlewareStatusPanel />;
}
