"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./menu.module.css";

type Item = {
  id: string;
  name: string;
  sku?: string | null;
  item_kind?: string | null;
  active?: boolean | null;
  has_variations?: boolean | null;
  has_recipe?: boolean | null;
  base_recipe_count?: number | null;
  image_url?: string | null;
};

type Variant = {
  id: string;
  item_id: string;
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  active?: boolean | null;
  has_recipe?: boolean | null;
  image_url?: string | null;
};

type ItemWithVariants = { item: Item; variants: Variant[] };

export default function CatalogMenuPage() {
  const router = useRouter();
  const { status, readOnly, deleteDisabled } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, variantsRes] = await Promise.all([fetch("/api/catalog/items"), fetch("/api/catalog/variants")]);
      if (!itemsRes.ok) throw new Error("Unable to load products");
      if (!variantsRes.ok) throw new Error("Unable to load variants");

      const itemsJson = await itemsRes.json();
      const variantsJson = await variantsRes.json();
      setItems(Array.isArray(itemsJson.items) ? itemsJson.items : []);
      setVariants(Array.isArray(variantsJson.variants) ? variantsJson.variants : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!itemId) return;
      if (deleteDisabled) {
        setError("Delete access is disabled for this user.");
        return;
      }
      const confirmation = window.prompt("Type YES to confirm deleting this product.");
      if (!confirmation || confirmation.trim().toLowerCase() !== "yes") {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/catalog/items?id=${encodeURIComponent(itemId)}`, { method: "DELETE" });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to delete product");
        }
        await load();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to delete product");
      } finally {
        setLoading(false);
      }
    },
    [load, deleteDisabled]
  );

  useEffect(() => {
    load();
  }, [load]);
  const isReady = status === "ok";

  const itemKindOptions = useMemo(() => {
    const kinds = new Set<string>();
    for (const item of items) {
      const kind = (item.item_kind ?? "product").trim();
      if (kind) kinds.add(kind);
    }
    return Array.from(kinds).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [items]);

  const groupedData = useMemo(() => {
    const term = search.trim().toLowerCase();
    const buildGrouped = (sourceItems: Item[]) => {
      const sortedItems = [...sourceItems].sort((a, b) => {
        const left = (a.name ?? "").toLowerCase();
        const right = (b.name ?? "").toLowerCase();
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      });
      return sortedItems
        .map((item) => {
          const itemVariants = variants.filter((variant) => variant.item_id === item.id);
          const productMatches =
            !term || item.name?.toLowerCase().includes(term) || (item.sku ?? "").toLowerCase().includes(term);
          const matchingVariants = term
            ? itemVariants.filter((variant) => {
                const name = variant.name?.toLowerCase?.() ?? "";
                const sku = (variant.sku ?? "").toLowerCase();
                return name.includes(term) || sku.includes(term);
              })
            : itemVariants;

          const hasMatch = productMatches || matchingVariants.length > 0;
          if (!hasMatch) return null;
          return { item, variants: matchingVariants.length ? matchingVariants : itemVariants };
        })
        .filter((entry): entry is ItemWithVariants => Boolean(entry));
    };

    if (typeFilter === "all") {
      const kindOrder = [
        { key: "finished", label: "Finished Products" },
        { key: "ingredient", label: "Ingredients" },
        { key: "raw", label: "Raws" }
      ];
      const sections = kindOrder.map((kind) => {
        const sectionItems = items.filter((item) => {
          const normalized = (item.item_kind ?? "product").trim().toLowerCase();
          return normalized === kind.key;
        });
        return { ...kind, entries: buildGrouped(sectionItems) };
      });
      return { mode: "sections" as const, sections };
    }

    const filteredItems = items.filter((item) => {
      const kind = (item.item_kind ?? "product").trim().toLowerCase();
      return kind === typeFilter;
    });
    return { mode: "flat" as const, entries: buildGrouped(filteredItems) };
  }, [items, variants, search, typeFilter]);

  const variantCount = useMemo(() => variants.length, [variants]);

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Menu</h1>
            <p className={styles.subtitle}>Browse existing products and the variants attached to each one.</p>
            <p className={styles.metaLine}>
              Showing {items.length} products and {variantCount} variants.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondaryButton} onClick={() => router.back()}>
              Back
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice")}>
              Back to Dashboard
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice/catalog/manage")}>
              Add product
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice/recipes")}>
              Recipe setup
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
                <label className={styles.inputLabel} htmlFor="catalog-search">
                  Search
                </label>
                <input
                  id="catalog-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by product or variant name / SKU"
                  className={styles.searchInput}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="product-type-filter">
                  Product type
                </label>
                <select
                  id="product-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="all">All types</option>
                  {itemKindOptions.map((kind) => (
                    <option key={kind} value={kind.toLowerCase()}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </section>

            <section className={styles.sections}>
              {groupedData.mode === "flat" && groupedData.entries.length === 0 && !loading ? (
                <div className={styles.emptyCard}>No products found.</div>
              ) : groupedData.mode === "sections" ? (
                groupedData.sections.every((section) => section.entries.length === 0) && !loading ? (
                  <div className={styles.emptyCard}>No products found.</div>
                ) : (
                  groupedData.sections.map((section) => (
                    <div key={section.key} className={styles.sectionBlock}>
                      <p className={styles.sectionHeader}>{section.label}</p>
                      <div className={styles.sectionGrid}>
                        {section.entries.map(({ item, variants: itemVariants }) => {
                          const baseRecipeCount = item.base_recipe_count ?? 0;
                          const hasRecipe = baseRecipeCount > 0;
                          const hasVariants = itemVariants.length > 0;
                          return (
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
                                  <div className={styles.cardCornerActions}>
                                    <button
                                      className={`${styles.cornerButton} ${styles.triangleButton}`}
                                      onClick={() =>
                                        router.push(`/Warehouse_Backoffice/catalog/variants?item_id=${encodeURIComponent(item.id)}`)
                                      }
                                      type="button"
                                      aria-label="View variants"
                                      disabled={!hasVariants}
                                    >
                                      <span className={styles.triangleIcon} />
                                    </button>
                                    <button
                                      className={`${styles.cornerButton} ${styles.squareButton}`}
                                      onClick={() =>
                                        router.push(
                                          `/Warehouse_Backoffice/catalog/recipe-components?item_id=${encodeURIComponent(item.id)}`
                                        )
                                      }
                                      type="button"
                                      aria-label="View recipe components"
                                      disabled={!hasRecipe}
                                    >
                                      <span className={styles.squareIcon} />
                                    </button>
                                  </div>
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
                                <button
                                  className={`${styles.iconButton} ${styles.deleteButton}`}
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={readOnly}
                                  aria-label="Delete product"
                                  title="Delete product"
                                >
                                  <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                      d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM6 7h12l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className={styles.sectionBlock}>
                  <div className={styles.sectionGrid}>
                    {groupedData.entries.map(({ item, variants: itemVariants }) => {
                      const baseRecipeCount = item.base_recipe_count ?? 0;
                      const hasRecipe = baseRecipeCount > 0;
                      const hasVariants = itemVariants.length > 0;
                      return (
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
                              <div className={styles.cardCornerActions}>
                                <button
                                  className={`${styles.cornerButton} ${styles.triangleButton}`}
                                  onClick={() =>
                                    router.push(`/Warehouse_Backoffice/catalog/variants?item_id=${encodeURIComponent(item.id)}`)
                                  }
                                  type="button"
                                  aria-label="View variants"
                                  disabled={!hasVariants}
                                >
                                  <span className={styles.triangleIcon} />
                                </button>
                                <button
                                  className={`${styles.cornerButton} ${styles.squareButton}`}
                                  onClick={() =>
                                    router.push(
                                      `/Warehouse_Backoffice/catalog/recipe-components?item_id=${encodeURIComponent(item.id)}`
                                    )
                                  }
                                  type="button"
                                  aria-label="View recipe components"
                                  disabled={!hasRecipe}
                                >
                                  <span className={styles.squareIcon} />
                                </button>
                              </div>
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
                            <button
                              className={`${styles.iconButton} ${styles.deleteButton}`}
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={readOnly}
                              aria-label="Delete product"
                              title="Delete product"
                            >
                              <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM6 7h12l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
