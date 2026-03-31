"use client";

import { useRouter } from "next/navigation";
import styles from "./outlet-setup-hub.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

export default function OutletSetupHub() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const go = (path: string) => router.push(path);
  const back = () => router.push("/Warehouse_Backoffice");
  const backOne = () => router.back();

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet Setup</h1>
            <p className={styles.subtitle}>
              Configure outlet routes, order routing, and warehouse assignments in one place.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={backOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={back} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.actionsGrid}>
          <button
            onClick={() => go("/Warehouse_Backoffice/outlet-routing")}
            className={`${styles.actionCard} ${styles.routingCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleRouting}`}>Sales Item Routing</p>
            <p className={styles.cardBody}>Choose which warehouse each outlet deducts from per product for sales.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button
            onClick={() => go("/Warehouse_Backoffice/order-routing")}
            className={`${styles.actionCard} ${styles.orderRoutingCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleOrderRouting}`}>Order Item Routing</p>
            <p className={styles.cardBody}>Choose which warehouse each outlet deducts from per product for orders.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button
            onClick={() => go("/Warehouse_Backoffice/outlet-warehouse-assignments")}
            className={`${styles.actionCard} ${styles.assignmentsCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleAssignments}`}>Outlet to Warehouse Setup</p>
            <p className={styles.cardBody}>Assign outlets to warehouses for stock periods and POS validation.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
        </section>
      </main>
    </div>
  );
}
