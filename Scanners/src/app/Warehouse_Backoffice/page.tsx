"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "./dashboard.module.css";

type NegativeAlertRow = {
  id: string;
  created_at: string;
  details: {
    order_number?: string;
    item_name?: string;
    warehouse_name?: string;
    qty?: number;
    available?: number;
  } | null;
};

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [negativeAlerts, setNegativeAlerts] = useState<NegativeAlertRow[]>([]);

  const goToProducts = () => router.push("/Warehouse_Backoffice/catalog/menu");
  const goToBulkVariantUpdate = () => router.push("/Warehouse_Backoffice/variant-bulk-update");
  const goToSuppliers = () => router.push("/Warehouse_Backoffice/suppliers");
  const goToPurchaseEntry = () => router.push("/Warehouse_Backoffice/purchase-entry");
  const goToRecipes = () => router.push("/Warehouse_Backoffice/recipes");
  const goToOutletAutomation = () => router.push("/Warehouse_Backoffice/outlet-setup");
  const goToOutletOrders = () => router.push("/Warehouse_Backoffice/outlet-orders");
  const goToOutletBalances = () => router.push("/Warehouse_Backoffice/outlet-warehouse-balances");
  const goToStocktakes = () => router.push("/Warehouse_Backoffice/stocktakes");
  const goToProductionAssignments = () => router.push("/Warehouse_Backoffice/production-assignments");
  const goToDifferences = () => router.push("/Warehouse_Backoffice/Differences");
  const goToProductionDifferences = () => router.push("/Warehouse_Backoffice/production-differences");
  const goToReports = () => router.push("/Warehouse_Backoffice/reports-hub");

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadAlerts = async () => {
      try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("warehouse_backoffice_logs")
          .select("id,created_at,details")
          .in("action", ["order_negative_balance", "recipe_negative_balance"])
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) throw error;
        if (active) setNegativeAlerts((data as NegativeAlertRow[]) ?? []);
      } catch {
        if (active) setNegativeAlerts([]);
      }
    };

    loadAlerts();
    return () => {
      active = false;
    };
  }, [status, supabase]);

  if (status !== "ok") {
    return null;
  }

  const latestAlert = negativeAlerts[0];
  const latestDetails = latestAlert?.details ?? null;
  const latestHint = latestDetails?.order_number
    ? `Latest: order ${latestDetails.order_number}${latestDetails.item_name ? `, ${latestDetails.item_name}` : ""}${latestDetails.warehouse_name ? ` (${latestDetails.warehouse_name})` : ""}.`
    : "Review the log for details.";

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Warehouse Backoffice</h1>
            <p className={styles.subtitle}>
              One place to automate outlet warehouse defaults, deductions, and POS match against the single source of truth.
            </p>
            <p className={styles.shortcutNote}>Logs shortcut: Ctrl + Alt + Space, then X.</p>
          </div>
        </header>

        {negativeAlerts.length > 0 && (
          <section className={styles.alertBanner}>
            <div>
              <p className={styles.alertTitle}>Negative stock used in deductions</p>
              <p className={styles.alertBody}>
                {`${negativeAlerts.length} recent deduction${negativeAlerts.length > 1 ? "s" : ""} used negative stock. ${latestHint}`}
              </p>
            </div>
            <div className={styles.alertActions}>
              <button className={styles.alertButton} onClick={() => router.push("/Warehouse_Backoffice/logs")}>
                View logs
              </button>
            </div>
          </section>
        )}

        <section className={styles.actionsGrid}>
          <button onClick={goToProducts} className={`${styles.actionCard} ${styles.catalogCard}`}>
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Products</p>
            <p className={styles.cardBody}>Open the full product list with the original card layout.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToBulkVariantUpdate} className={`${styles.actionCard} ${styles.bulkCard}`}>
            <p className={`${styles.cardTitle} ${styles.bulkTitle}`}>Bulk Variant Update</p>
            <p className={styles.cardBody}>Apply a single value to multiple variants in one step.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToSuppliers} className={`${styles.actionCard} ${styles.suppliersCard}`}>
            <p className={`${styles.cardTitle} ${styles.suppliersTitle}`}>Suppliers</p>
            <p className={styles.cardBody}>Create supplier contacts for purchase intake and scanner logs.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToPurchaseEntry} className={`${styles.actionCard} ${styles.purchaseEntryCard}`}>
            <p className={`${styles.cardTitle} ${styles.purchaseEntryTitle}`}>Purchase Entry</p>
            <p className={styles.cardBody}>Record scanner purchase receipts from backoffice.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToRecipes} className={`${styles.actionCard} ${styles.catalogCard}`}>
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Recipes</p>
            <p className={styles.cardBody}>Define finished and ingredient recipes with warehouse sources.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletAutomation} className={`${styles.actionCard} ${styles.routingCard}`}>
            <p className={`${styles.cardTitle} ${styles.routingTitle}`}>Outlet Automation</p>
            <p className={styles.cardBody}>Set outlet defaults, deductions, storage homes, and POS match.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletOrders} className={`${styles.actionCard} ${styles.outletOrdersCard}`}>
            <p className={`${styles.cardTitle} ${styles.outletOrdersTitle}`}>Outlet Orders</p>
            <p className={styles.cardBody}>Review outlet orders, signatures, and offload PDFs.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletBalances} className={`${styles.actionCard} ${styles.balanceCard}`}>
            <p className={`${styles.cardTitle} ${styles.balanceTitle}`}>Outlet Balances</p>
            <p className={styles.cardBody}>Live balances and usage across outlet warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToStocktakes} className={`${styles.actionCard} ${styles.stocktakeCard}`}>
            <p className={`${styles.cardTitle} ${styles.stocktakeTitle}`}>Stocktakes</p>
            <p className={styles.cardBody}>Open and close stock periods with variance exports.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToProductionAssignments} className={`${styles.actionCard} ${styles.productionCard}`}>
            <p className={`${styles.cardTitle} ${styles.productionTitle}`}>Production Assignments</p>
            <p className={styles.cardBody}>Assign finished goods to production warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToDifferences} className={`${styles.actionCard} ${styles.productionCard}`}>
            <p className={`${styles.cardTitle} ${styles.productionTitle}`}>Opening Differences</p>
            <p className={styles.cardBody}>Compare opening ingredient counts with recipe-based servings.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToProductionDifferences} className={`${styles.actionCard} ${styles.productionCard}`}>
            <p className={`${styles.cardTitle} ${styles.productionTitle}`}>Production Differences</p>
            <p className={styles.cardBody}>Compare producible servings with recorded production entries.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToReports} className={`${styles.actionCard} ${styles.reportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.reportsTitle}`}>Reports</p>
            <p className={styles.cardBody}>Sales, orders, scanner activity, and stock reporting.</p>
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
