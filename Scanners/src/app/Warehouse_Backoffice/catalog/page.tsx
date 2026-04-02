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
            <h1 className={styles.title}>Product Setup & Purchase Entry</h1>
            <p className={styles.subtitle}>
              Create items, variants, recipes, supplier links, and purchase entries for outlet routing and POS matching.
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
            onClick={() => go("/Warehouse_Backoffice/recipes")}
            className={`${styles.actionCard} ${styles.recipeCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleRecipe}`}>Recipe Setup</p>
            <p className={styles.cardBody}>Link finished goods to ingredients, and ingredients to raw materials.</p>
            <span className={styles.cardCta}>Open recipes</span>
          </button>
          <button
            onClick={() => go("/Warehouse_Backoffice/catalog/vehicles")}
            className={`${styles.actionCard} ${styles.vehicleCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleVehicle}`}>Vehicles</p>
            <p className={styles.cardBody}>Manage vehicles, plates, and assignments for fuel transfers.</p>
            <span className={styles.cardCta}>Open vehicles</span>
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
            onClick={() => go("/Warehouse_Backoffice/suppliers")}
            className={`${styles.actionCard} ${styles.suppliersCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleSuppliers}`}>Suppliers</p>
            <p className={styles.cardBody}>Create supplier contacts for purchase intake and scanner logs.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button
            onClick={() => go("/Warehouse_Backoffice/purchase-entry")}
            className={`${styles.actionCard} ${styles.purchaseCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitlePurchase}`}>Purchase Entry</p>
            <p className={styles.cardBody}>Record scanner purchase receipts from backoffice.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button
            onClick={() => go("/Warehouse_Backoffice/outlet-setup")}
            className={`${styles.actionCard} ${styles.routingCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleRouting}`}>Item To Warehouse Assignments</p>
            <p className={styles.cardBody}>Set outlet sales defaults, per-item routing, and storage homes.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
        </section>
      </main>
    </div>
  );
}
