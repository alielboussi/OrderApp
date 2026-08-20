"use client";

import { useRouter } from "next/navigation";
import styles from "./catalog.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";
export default function CatalogMenu() {
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
            <h1 className={styles.title}>Product Setup</h1>
            <p className={styles.subtitle}>
              Create items, variants, recipes, and supplier links for outlet routing and POS matching.
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
            onClick={() => go("/Warehouse_Backoffice/catalog/menu")}
            className={`${styles.actionCard} ${styles.menuCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleMenu}`}>Products</p>
            <p className={styles.cardBody}>Open the full product list with the original card layout.</p>
            <span className={styles.cardCta}>Open products</span>
          </button>
          <button
            onClick={() => go("/Warehouse_Backoffice/variant-bulk-update")}
            className={`${styles.actionCard} ${styles.bulkCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleBulk}`}>Bulk Variant Update</p>
            <p className={styles.cardBody}>Apply a single value to multiple variants in one step.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
          <button
            onClick={() => go("/Warehouse_Backoffice/stock-api-sync")}
            className={`${styles.actionCard} ${styles.bulkCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleBulk}`}>Stock API Sync</p>
            <p className={styles.cardBody}>
              Pull product changes from stock control on demand (manual only — keeps cloud costs low).
            </p>
            <span className={styles.cardCta}>Open</span>
          </button>

        </section>
      </main>
    </div>
  );
}
