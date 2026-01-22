"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const goToInventory = () => router.push("/Warehouse_Backoffice/inventory");
  const goToCatalog = () => router.push("/Warehouse_Backoffice/catalog");
  const goToOutletSetup = () => router.push("/Warehouse_Backoffice/outlet-setup");
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
            <p className={styles.notice}>Schema live: outlets.default_sales_warehouse_id, outlet_item_routes, item_storage_homes.</p>
          </div>
        </header>

        <section className={styles.actionsGrid}>
          <button onClick={goToOutletSetup} className={`${styles.actionCard} ${styles.routingCard}`}>
            <p className={`${styles.cardTitle} ${styles.routingTitle}`}>Outlet Setup</p>
            <p className={styles.cardBody}>Set outlet sales defaults, per-item routing, and product storage homes in one flow.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToCatalog} className={`${styles.actionCard} ${styles.catalogCard}`}>
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Catalog & Recipes</p>
            <p className={styles.cardBody}>Manage items, variants, and recipes that drive outlet_item_routes and storage homes.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToPosMatch} className={`${styles.actionCard} ${styles.mappingCard}`}>
            <p className={`${styles.cardTitle} ${styles.mappingTitle}`}>POS Match</p>
            <p className={styles.cardBody}>Map POS items/flavours to catalog item + variant + warehouse for deductions.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToInventory} className={`${styles.actionCard} ${styles.inventoryCard}`}>
            <p className={`${styles.cardTitle} ${styles.inventoryTitle}`}>Inventory Ops</p>
            <p className={styles.cardBody}>Process transfers, purchases, and damages with the new warehouse roles.</p>
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
