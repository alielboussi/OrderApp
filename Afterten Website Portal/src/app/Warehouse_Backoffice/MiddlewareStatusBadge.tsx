"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MIDDLEWARE_POLL_MS } from "./middlewareMonitorShared";
import styles from "./enterprise.module.css";

type MiddlewareStatusResponse = {
  online_count: number;
  offline_count: number;
  outlets: Array<{ offline: boolean }>;
};

export default function MiddlewareStatusBadge() {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [offlineCount, setOfflineCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/middleware-status", { cache: "no-store" });
        if (!res.ok) throw new Error("middleware status failed");
        const json = (await res.json()) as MiddlewareStatusResponse;
        if (!active) return;
        setOnlineCount(json.online_count ?? 0);
        setOfflineCount(json.offline_count ?? 0);
        setError(false);
      } catch {
        if (active) {
          setOnlineCount(null);
          setOfflineCount(null);
          setError(true);
        }
      }
    };

    load();
    const interval = window.setInterval(load, MIDDLEWARE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const label =
    error || onlineCount === null || offlineCount === null
      ? "Middleware: unavailable"
      : offlineCount > 0
        ? `Middleware: ${onlineCount} online · ${offlineCount} offline`
        : `Middleware: ${onlineCount} online`;

  const tone =
    error || onlineCount === null || offlineCount === null
      ? styles.middlewareBadgeMuted
      : offlineCount > 0
        ? styles.middlewareBadgeWarn
        : styles.middlewareBadgeOk;

  return (
    <Link href="/Warehouse_Backoffice/middleware" className={`${styles.middlewareBadge} ${tone}`}>
      {label}
    </Link>
  );
}
