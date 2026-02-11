"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const [posAlertCount, setPosAlertCount] = useState<number | null>(null);
  const [posAlertSamples, setPosAlertSamples] = useState<Array<{ outlet_id: string; pos_item_id: string; pos_flavour_id: string | null }>>([]);
  const [posFailureCount, setPosFailureCount] = useState<number | null>(null);
  const [posFailureSamples, setPosFailureSamples] = useState<Array<{ outlet_id: string | null; source_event_id: string | null; stage: string; error_message: string }>>([]);
  const [posAlertError, setPosAlertError] = useState<string | null>(null);

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

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    const load = async () => {
      try {
        const alertRes = await fetchJson<{
          mappingMismatchCount: number;
          mappingMismatchSamples?: Array<{ outlet_id: string; pos_item_id: string; pos_flavour_id: string | null }>;
          syncFailureCount: number;
          syncFailureSamples?: Array<{ outlet_id: string | null; source_event_id: string | null; stage: string; error_message: string }>;
        }>("/api/pos-sync-alert");
        if (!active) return;
        setPosAlertCount(typeof alertRes.mappingMismatchCount === "number" ? alertRes.mappingMismatchCount : 0);
        setPosAlertSamples(Array.isArray(alertRes.mappingMismatchSamples) ? alertRes.mappingMismatchSamples : []);
        setPosFailureCount(typeof alertRes.syncFailureCount === "number" ? alertRes.syncFailureCount : 0);
        setPosFailureSamples(Array.isArray(alertRes.syncFailureSamples) ? alertRes.syncFailureSamples : []);
        setPosAlertError(null);
      } catch (err) {
        if (!active) return;
        setPosAlertError("Unable to load POS mapping alerts");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [status]);


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
        </header>

        {posAlertError ? (
          <section className={styles.alertBanner}>
            <div>
              <p className={styles.alertTitle}>POS mapping alert unavailable</p>
              <p className={styles.alertBody}>{posAlertError}</p>
            </div>
          </section>
        ) : (posAlertCount && posAlertCount > 0) || (posFailureCount && posFailureCount > 0) ? (
          <section className={styles.alertBanner}>
            <div>
              <p className={styles.alertTitle}>POS sync attention needed</p>
              {posAlertCount && posAlertCount > 0 && (
                <p className={styles.alertBody}>
                  Mapping mismatches: {posAlertCount} line{posAlertCount === 1 ? "" : "s"} in the last 7 days had a POS
                  item/flavour combination with no mapping.
                </p>
              )}
              {posAlertSamples.length > 0 && (
                <p className={styles.alertBody}>
                  Example mapping: outlet {posAlertSamples[0].outlet_id}, item {posAlertSamples[0].pos_item_id}
                  {posAlertSamples[0].pos_flavour_id ? `, flavour ${posAlertSamples[0].pos_flavour_id}` : ", flavour (none)"}
                </p>
              )}
              {posFailureCount && posFailureCount > 0 && (
                <p className={styles.alertBody}>
                  Sync failures: {posFailureCount} event{posFailureCount === 1 ? "" : "s"} in the last 7 days failed to
                  validate or sync.
                </p>
              )}
              {posFailureSamples.length > 0 && (
                <p className={styles.alertBody}>
                  Example failure: {posFailureSamples[0].stage} ({posFailureSamples[0].error_message})
                </p>
              )}
            </div>
            <div className={styles.alertActions}>
              <button className={styles.alertButton} onClick={goToPosMatch}>
                Review POS mappings
              </button>
            </div>
          </section>
        ) : null}

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
