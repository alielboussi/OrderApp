"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const [syncPaused, setSyncPaused] = useState<boolean | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const supabase = getWarehouseBrowserClient();

  const goToInventory = () => router.push("/Warehouse_Backoffice/inventory");
  const goToCatalog = () => router.push("/Warehouse_Backoffice/catalog");
  const goToOutletSetup = () => router.push("/Warehouse_Backoffice/outlet-setup");
  const goToPosMatch = () => router.push("/Warehouse_Backoffice/catalog/pos-item-map");
  const goToOutletBalances = () => router.push("/Warehouse_Backoffice/outlet-warehouse-balances");
  const goToOutletWarehouseAssignments = () => router.push("/Warehouse_Backoffice/outlet-warehouse-assignments");
  const goToReports = () => router.push("/Warehouse_Backoffice/reports");
  const goToVariantBulkUpdate = () => router.push("/Warehouse_Backoffice/variant-bulk-update");
  const goToStockReports = () => router.push("/Warehouse_Backoffice/stock-reports");

  useEffect(() => {
    if (status !== "ok") {
      return;
    }

    const loadPauseState = async () => {
      setSyncLoading(true);
      setSyncError(null);
      const { data, error } = await supabase
        .from("counter_values")
        .select("last_value")
        .eq("counter_key", "pos_sync_paused")
        .eq("scope_id", "00000000-0000-0000-0000-000000000000")
        .maybeSingle();

      if (error) {
        setSyncError(error.message);
        setSyncLoading(false);
        return;
      }

      setSyncPaused((data?.last_value ?? 0) > 0);
      setSyncLoading(false);
    };

    void loadPauseState();
  }, [status, supabase]);

  const toggleSyncPaused = async () => {
    if (syncPaused === null) {
      return;
    }

    const nextValue = syncPaused ? 0 : 1;
    setSyncLoading(true);
    setSyncError(null);

    const { error } = await supabase
      .from("counter_values")
      .upsert(
        {
          counter_key: "pos_sync_paused",
          scope_id: "00000000-0000-0000-0000-000000000000",
          last_value: nextValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "counter_key,scope_id" }
      );

    if (error) {
      setSyncError(error.message);
      setSyncLoading(false);
      return;
    }

    setSyncPaused(nextValue > 0);
    setSyncLoading(false);
  };

  if (status !== "ok") {
    return null;
  }
  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Warehouse Backoffice</h1>
            <p className={styles.subtitle}>
              Configure outlet defaults, per-item routing, and POS match against the new warehouse schema. Operate inventory without legacy outlet-warehouse tables.
            </p>
            <p className={styles.shortcutNote}>Logs shortcut: Ctrl + Alt + Space, then X.</p>
          </div>
          <div className={styles.heroControl}>
            <p className={`${styles.cardTitle} ${styles.pauseTitle}`}>POS Sync Control</p>
            <p className={styles.cardBody}>Pause or resume POS sale syncing across every outlet.</p>
            <div className={styles.pauseRow}>
              <label className={styles.toggleSwitch}>
                <input
                  className={styles.toggleInput}
                  type="checkbox"
                  checked={Boolean(syncPaused)}
                  onChange={toggleSyncPaused}
                  disabled={syncLoading || syncPaused === null}
                  aria-label="Toggle POS sync"
                />
                <span className={styles.toggleTrack} aria-hidden="true" />
              </label>
              <span className={styles.pauseState}>
                {syncLoading ? "Updating..." : syncPaused === null ? "Status unknown" : syncPaused ? "Paused" : "Active"}
              </span>
            </div>
            {syncError ? <p className={styles.pauseError}>Error: {syncError}</p> : null}
          </div>
        </header>

        <section className={styles.actionsGrid}>
          <button onClick={goToOutletSetup} className={`${styles.actionCard} ${styles.routingCard}`}>
            <p className={`${styles.cardTitle} ${styles.routingTitle}`}>Item To Warehouse Assignments</p>
            <p className={styles.cardBody}>Set outlet sales defaults, per-item routing, and product storage homes in one flow.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletBalances} className={`${styles.actionCard} ${styles.balanceCard}`}>
            <p className={`${styles.cardTitle} ${styles.balanceTitle}`}>Outlet Warehouse Balances</p>
            <p className={styles.cardBody}>Track live ingredient and raw stock remaining for outlet warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletWarehouseAssignments} className={`${styles.actionCard} ${styles.assignmentsCard}`}>
            <p className={`${styles.cardTitle} ${styles.assignmentsTitle}`}>Outlet → Warehouse Setup</p>
            <p className={styles.cardBody}>Assign outlets to warehouses for stock periods and POS validation.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToCatalog} className={`${styles.actionCard} ${styles.catalogCard}`}>
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Menu Items & Recipes</p>
            <p className={styles.cardBody}>Manage items, variants, and recipes that drive outlet_item_routes and storage homes.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToPosMatch} className={`${styles.actionCard} ${styles.mappingCard}`}>
            <p className={`${styles.cardTitle} ${styles.mappingTitle}`}>MIntpos-App Match</p>
            <p className={styles.cardBody}>Map POS items/flavours to catalog item + variant + warehouse for deductions.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToReports} className={`${styles.actionCard} ${styles.reportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.reportsTitle}`}>Outlet Sales Reports</p>
            <p className={styles.cardBody}>Filter sales by outlet, date, and product type with before/after tax totals.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToInventory} className={`${styles.actionCard} ${styles.inventoryCard}`}>
            <p className={`${styles.cardTitle} ${styles.inventoryTitle}`}>Scanner Reports</p>
            <p className={styles.cardBody}>Process transfers, purchases, and damages with the new warehouse roles.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToVariantBulkUpdate} className={`${styles.actionCard} ${styles.bulkCard}`}>
            <p className={`${styles.cardTitle} ${styles.bulkTitle}`}>Bulk Variant Update</p>
            <p className={styles.cardBody}>Apply a single value to multiple variants in one step.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToStockReports} className={`${styles.actionCard} ${styles.stockReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.stockReportsTitle}`}>Stock Reports</p>
            <p className={styles.cardBody}>Review stocktake periods for mapped warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

        </section>

      </main>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-2px);
}
`;
