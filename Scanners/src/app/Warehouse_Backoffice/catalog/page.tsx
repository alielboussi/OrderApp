"use client";

import { useRouter } from "next/navigation";
import styles from "./catalog.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

export default function CatalogMenu() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  const go = (path: string) => router.push(path);
  const back = () => router.push("/Warehouse_Backoffice");
  const backOne = () => router.back();

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Catalog Builder</h1>
            <p className={styles.subtitle}>Manage products, variants, and supporting data for the stock app.</p>
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
            onClick={() => go("/Warehouse_Backoffice/catalog/manage")}
            className={`${styles.actionCard} ${styles.productCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleProduct}`}>Manage Catalog</p>
            <p className={styles.cardBody}>Add products and variants on one page, then preview the menu.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
          <button
            onClick={() => go("/Warehouse_Backoffice/recipes")}
            className={`${styles.actionCard} ${styles.recipeCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleRecipe}`}>Recipes</p>
            <p className={styles.cardBody}>Link finished goods to ingredients, and ingredients to raw materials.</p>
            <span className={styles.cardCta}>Open recipes</span>
          </button>
        </section>
      </main>
    </div>
  );
}
