"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const goToCatalog = () => router.push("/Warehouse_Backoffice/catalog");
  const goToOutletBalances = () => router.push("/Warehouse_Backoffice/outlet-warehouse-balances");
  const goToStocktakes = () => router.push("/Warehouse_Backoffice/stocktakes");
  const goToReports = () => router.push("/Warehouse_Backoffice/reports-hub");
  const goToOutletSetup = () => router.push("/Warehouse_Backoffice/outlet-setup-hub");
  const goToOutletOrders = () => router.push("/Warehouse_Backoffice/outlet-orders");
  const goToPosMatch = () => router.push("/Warehouse_Backoffice/catalog/pos-item-map");

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
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Product Setup & Purchase Entry</p>
            <p className={styles.cardBody}>Manage items, variants, and recipes that drive outlet routing and storage homes.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletSetup} className={`${styles.actionCard} ${styles.routingCard}`}>
            <p className={`${styles.cardTitle} ${styles.routingTitle}`}>Outlet Setup</p>
            <p className={styles.cardBody}>Configure outlet routes and warehouse mapping in one place.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToPosMatch} className={`${styles.actionCard} ${styles.mappingCard}`}>
            <p className={`${styles.cardTitle} ${styles.mappingTitle}`}>MIntpos-App Match</p>
            <p className={styles.cardBody}>Map POS items/flavours to catalog item + variant + warehouse for deductions.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletOrders} className={`${styles.actionCard} ${styles.outletOrdersCard}`}>
            <p className={`${styles.cardTitle} ${styles.outletOrdersTitle}`}>Outlet Orders</p>
            <p className={styles.cardBody}>Verify order creation, approvals, and totals.</p>
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
