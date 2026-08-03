"use client";

import { useEffect, useState } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import MiddlewareStatusPanel from "../MiddlewareStatusPanel";
import PosSyncFailuresPanel from "../PosSyncFailuresPanel";
import OutletCatalogPushPanel from "../OutletCatalogPushPanel";
import {
  MIDDLEWARE_FAILURES_DESCRIPTION,
  MIDDLEWARE_MAIN_DESCRIPTION,
  parseMiddlewareView,
  type MiddlewareHubView,
} from "../middlewareHub";
import styles from "./middlewareHub.module.css";

export default function MiddlewareHubPage() {
  const { status } = useWarehouseAuth();
  const [view, setView] = useState<MiddlewareHubView>("main");

  useEffect(() => {
    const syncView = () => setView(parseMiddlewareView(window.location.hash));
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  if (status !== "ok") return null;

  const description = view === "failures" ? MIDDLEWARE_FAILURES_DESCRIPTION : MIDDLEWARE_MAIN_DESCRIPTION;

  return (
    <div className={styles.page}>
      <p className={styles.lead}>{description}</p>

      {view === "failures" ? (
        <div className={styles.panel}>
          <PosSyncFailuresPanel />
        </div>
      ) : (
        <div className={styles.panel}>
          <MiddlewareStatusPanel />
          <OutletCatalogPushPanel />
        </div>
      )}
    </div>
  );
}
