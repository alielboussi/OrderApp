"use client";

import { useRouter } from "next/navigation";
import styles from "./catalog.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

export default function CatalogMenu() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  const go = (path: string) => router.push(path);
  const back = () => router.push("/Warehouse_Backoffice/inventory");

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Catalog Builder</h1>
            <p className={styles.subtitle}>Create products and their variants. Use the buttons below to open the forms.</p>
          </div>
          <button onClick={back} className={styles.backButton}>
            Back
          </button>
        </header>

        <section className={styles.actionsGrid}>
          <button
            onClick={() => go("/Warehouse_Backoffice/catalog/product")}
            className={`${styles.actionCard} ${styles.productCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleProduct}`}>New Product</p>
            <p className={styles.cardBody}>Add a base product to catalog_items with clear units and defaults.</p>
            <span className={styles.cardCta}>Open form</span>
          </button>
          <button
            onClick={() => go("/Warehouse_Backoffice/catalog/variant")}
            className={`${styles.actionCard} ${styles.variantCard}`}
          >
            <p className={`${styles.cardTitle} ${styles.cardTitleVariant}`}>New Variant</p>
            <p className={styles.cardBody}>Attach a variant to an existing product.</p>
            <span className={styles.cardCta}>Open form</span>
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
