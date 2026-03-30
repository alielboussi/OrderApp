"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const goToCatalog = () => router.push("/Warehouse_Backoffice/catalog");
  const goToVariantBulkUpdate = () => router.push("/Warehouse_Backoffice/variant-bulk-update");
  const goToSuppliers = () => router.push("/Warehouse_Backoffice/suppliers");
  const goToPurchaseEntry = () => router.push("/Warehouse_Backoffice/purchase-entry");
  const goToOutletBalances = () => router.push("/Warehouse_Backoffice/outlet-warehouse-balances");
  const goToStocktakes = () => router.push("/Warehouse_Backoffice/stocktakes");
  const goToSetup = () => router.push("/Warehouse_Backoffice/setup");
  const goToReports = () => router.push("/Warehouse_Backoffice/reports-hub");

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

        <section className={styles.actionsGrid}>
          <button onClick={goToCatalog} className={`${styles.actionCard} ${styles.catalogCard}`}>
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Menu Items & Recipes</p>
            <p className={styles.cardBody}>Manage items, variants, and recipes that drive outlet_item_routes and storage homes.</p>
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

          <button onClick={goToPurchaseEntry} className={`${styles.actionCard} ${styles.purchaseEntryCard}`}>
            <p className={`${styles.cardTitle} ${styles.purchaseEntryTitle}`}>Purchase Entry</p>
            <p className={styles.cardBody}>Record scanner purchase receipts from backoffice.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletBalances} className={`${styles.actionCard} ${styles.balanceCard}`}>
            <p className={`${styles.cardTitle} ${styles.balanceTitle}`}>Outlet Warehouse Balances</p>
            <p className={styles.cardBody}>Track live ingredient and raw stock remaining for outlet warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToStocktakes} className={`${styles.actionCard} ${styles.stocktakeCard}`}>
            <p className={`${styles.cardTitle} ${styles.stocktakeTitle}`}>Warehouse Stocktakes</p>
            <p className={styles.cardBody}>Run opening and closing counts, close periods, and export variance PDFs.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToReports} className={`${styles.actionCard} ${styles.reportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.reportsTitle}`}>Reports</p>
            <p className={styles.cardBody}>Outlet sales, orders, scanner activity, and stock reports.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToSetup} className={`${styles.actionCard} ${styles.assignmentsCard}`}>
            <p className={`${styles.cardTitle} ${styles.assignmentsTitle}`}>Setup</p>
            <p className={styles.cardBody}>Assignments, outlet routing, POS mapping, and outlet orders setup.</p>
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
