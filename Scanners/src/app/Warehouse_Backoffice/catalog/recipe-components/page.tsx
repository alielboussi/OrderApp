"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "../menu/menu.module.css";

type Item = {
  id: string;
  name: string;
  sku?: string | null;
  item_kind?: string | null;
  active?: boolean | null;
};

type RecipeIngredientsResponse = {
  ingredient_item_ids?: string[];
  error?: string;
};

function RecipeComponentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("item_id") ?? "";
  const { status } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingredientIds, setIngredientIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!itemId) {
      setError("Missing item_id for recipe components.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, recipeRes] = await Promise.all([
        fetch("/api/catalog/items"),
        fetch(`/api/recipe-ingredients?finished_item_id=${encodeURIComponent(itemId)}`)
      ]);
      if (!itemsRes.ok) throw new Error("Unable to load products");
      if (!recipeRes.ok) throw new Error("Unable to load recipe components");

      const itemsJson = await itemsRes.json();
      const recipeJson = (await recipeRes.json()) as RecipeIngredientsResponse;
      setItems(Array.isArray(itemsJson.items) ? itemsJson.items : []);
      setIngredientIds(Array.isArray(recipeJson.ingredient_item_ids) ? recipeJson.ingredient_item_ids : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load recipe components");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemMap = useMemo(() => {
    const map = new Map<string, Item>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const finishedItemName = itemMap.get(itemId)?.name ?? "";

  const ingredients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = ingredientIds
      .map((id) => itemMap.get(id))
      .filter((item): item is Item => Boolean(item))
      .filter((item) => {
        if (!term) return true;
        const nameMatch = item.name?.toLowerCase().includes(term);
        const skuMatch = (item.sku ?? "").toLowerCase().includes(term);
        return Boolean(nameMatch || skuMatch);
      })
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
    return list;
  }, [ingredientIds, itemMap, search]);

  const isReady = status === "ok";

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Recipe Components</h1>
            <p className={styles.subtitle}>
              {finishedItemName
                ? `Components for ${finishedItemName}.`
                : "Browse the ingredients for this recipe."}
            </p>
            <p className={styles.metaLine}>Showing {ingredients.length} components.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondaryButton} onClick={() => router.back()}>
              Back
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice/catalog/menu")}>
              Back to Menu
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice")}>
              Back to Dashboard
            </button>
            <button className={styles.primaryButton} onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {!isReady ? (
          <section className={styles.controls}>
            <div className={styles.error}>Not authorized for catalog.</div>
          </section>
        ) : (
          <>
            <section className={styles.controls}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Search</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by ingredient name / SKU"
                  className={styles.searchInput}
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </section>

            <section className={styles.grid}>
              {ingredients.length === 0 && !loading ? (
                <div className={styles.emptyCard}>No recipe components found.</div>
              ) : (
                ingredients.map((item) => (
                  <article key={item.id} className={styles.card} data-card>
                    <div className={styles.cardHeader}>
                      <p className={`${styles.skuTop} ${!item.sku ? styles.skuTopMuted : ""}`}>
                        SKU: {item.sku ?? "-"}
                      </p>
                      <div className={styles.cardTopRow}>
                        <span
                          className={`${styles.statusIcon} ${item.active === false ? styles.statusInactive : styles.statusActive}`}
                        >
                          <span className={styles.statusMark} />
                        </span>
                        <div className={styles.cardCornerActions} />
                      </div>
                      <div className={styles.cardMain}>
                        <div className={styles.cardTitleBlock}>
                          <div className={styles.rowTop}>
                            <p className={styles.itemKind}>{item.item_kind || "product"}</p>
                            <a
                              className={styles.iconButton}
                              href={`/Warehouse_Backoffice/catalog/product?id=${item.id}`}
                              aria-label="Edit product"
                              title="Edit product"
                            >
                              <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm15.7-9.8a1 1 0 0 0 0-1.4l-2-2a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.5-1.7Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </a>
                          </div>
                          <h2 className={styles.itemName}>{item.name}</h2>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function RecipeComponentsPageWrapper() {
  return (
    <Suspense fallback={<div className={styles.page}><main className={styles.shell}>Loading...</main></div>}>
      <RecipeComponentsPage />
    </Suspense>
  );
}
