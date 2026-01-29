"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [pausedOutletIds, setPausedOutletIds] = useState<Set<string>>(new Set());
  const [pauseLoading, setPauseLoading] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  const goToInventory = () => router.push("/Warehouse_Backoffice/inventory");
  const goToCatalog = () => router.push("/Warehouse_Backoffice/catalog");
  const goToOutletSetup = () => router.push("/Warehouse_Backoffice/outlet-setup");
  const goToPosMatch = () => router.push("/Warehouse_Backoffice/catalog/pos-item-map");
  const goToOutletBalances = () => router.push("/Warehouse_Backoffice/outlet-warehouse-balances");
  const goToOutletWarehouseAssignments = () => router.push("/Warehouse_Backoffice/outlet-warehouse-assignments");
  const goToReports = () => router.push("/Warehouse_Backoffice/reports");
  const goToVariantBulkUpdate = () => router.push("/Warehouse_Backoffice/variant-bulk-update");
  const goToStockReports = () => router.push("/Warehouse_Backoffice/stock-reports");
  const goToSuppliers = () => router.push("/Warehouse_Backoffice/suppliers");

  const selectedOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === selectedOutletId),
    [outlets, selectedOutletId]
  );
  const selectedPaused = selectedOutletId ? pausedOutletIds.has(selectedOutletId) : false;

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    const load = async () => {
      try {
        setPauseError(null);
        const [outletRes, pauseRes] = await Promise.all([
          fetchJson<{ outlets: Array<{ id: string; name: string; code: string | null }> }>("/api/outlets"),
          fetchJson<{ pausedOutletIds: string[] }>("/api/pos-sync-pause"),
        ]);
        if (!active) return;
        const outletList = outletRes.outlets ?? [];
        setOutlets(outletList);
        setPausedOutletIds(new Set(pauseRes.pausedOutletIds ?? []));
        if (!selectedOutletId && outletList.length > 0) {
          setSelectedOutletId(outletList[0].id);
        }
      } catch (err) {
        if (!active) return;
        setPauseError(err instanceof Error ? err.message : "Unable to load POS sync pause state");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [status, selectedOutletId]);

  const handleTogglePause = async () => {
    if (!selectedOutletId) {
      setPauseError("Select an outlet first.");
      return;
    }
    try {
      setPauseError(null);
      setPauseLoading(true);
      const nextPaused = !pausedOutletIds.has(selectedOutletId);
      await fetchJson<{ ok: boolean }>("/api/pos-sync-pause", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: selectedOutletId, paused: nextPaused }),
      });
      setPausedOutletIds((prev) => {
        const next = new Set(prev);
        if (nextPaused) {
          next.add(selectedOutletId);
        } else {
          next.delete(selectedOutletId);
        }
        return next;
      });
    } catch (err) {
      setPauseError(err instanceof Error ? err.message : "Unable to update pause state");
    } finally {
      setPauseLoading(false);
    }
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
            <p className={styles.pauseKicker}>POS Sync Control</p>
            <p className={styles.pauseTitleSmall}>Pause outlet sync</p>
            <label className={styles.pauseField}>
              Outlet
              <select
                className={styles.pauseSelect}
                value={selectedOutletId}
                onChange={(event) => setSelectedOutletId(event.target.value)}
                disabled={pauseLoading || outlets.length === 0}
              >
                {outlets.length === 0 && <option value="">No outlets</option>}
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name || outlet.code || outlet.id}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.pauseRow}>
              <button
                className={styles.pauseButton}
                onClick={handleTogglePause}
                disabled={!selectedOutletId || pauseLoading}
              >
                {selectedPaused ? "Resume sync" : "Pause sync"}
              </button>
              <span className={styles.pauseState}>
                {selectedOutlet ? `${selectedOutlet.name || selectedOutlet.code || "Outlet"}: ` : ""}
                {selectedPaused ? "Paused" : "Active"}
              </span>
            </div>
            {pauseError && <p className={styles.pauseError}>{pauseError}</p>}
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

          <button onClick={goToSuppliers} className={`${styles.actionCard} ${styles.suppliersCard}`}>
            <p className={`${styles.cardTitle} ${styles.suppliersTitle}`}>Suppliers</p>
            <p className={styles.cardBody}>Create supplier contacts for purchase intake and scanner logs.</p>
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

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}
