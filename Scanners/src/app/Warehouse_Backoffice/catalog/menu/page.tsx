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
};

type Variant = {
  id: string;
  item_id: string;
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  active?: boolean | null;
  has_recipe?: boolean | null;
};

type ItemWithVariants = { item: Item; variants: Variant[] };

export default function CatalogMenuPage() {
  const router = useRouter();
  const { status, readOnly, deleteDisabled } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
      const confirmed = window.confirm("Delete this product? This cannot be undone.");
      if (!confirmed) return;
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
    [load]
  );

  const handleDeleteVariant = useCallback(
    async (variantId: string, itemId: string) => {
      if (!variantId || !itemId) return;
      if (deleteDisabled) {
        setError("Delete access is disabled for this user.");
        return;
      }
      const confirmed = window.confirm("Delete this variant? This cannot be undone.");
      if (!confirmed) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/catalog/variants?id=${encodeURIComponent(variantId)}&item_id=${encodeURIComponent(itemId)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to delete variant");
        }
        await load();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to delete variant");
      } finally {
        setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    load();
  }, [load]);
  const isReady = status === "ok";

  const grouped: ItemWithVariants[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
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
  }, [items, variants, search]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

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
                  placeholder="Search by product or variant name / SKU"
                  className={styles.searchInput}
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </section>

            <section className={styles.grid}>
              {grouped.length === 0 && !loading ? (
                <div className={styles.emptyCard}>No products found.</div>
              ) : (
                grouped.map(({ item, variants: itemVariants }) => {
                  const open = expanded[item.id] ?? false;
                  const baseRecipeCount = item.base_recipe_count ?? 0;
                  const hasRecipe = (item.has_recipe ?? false) || baseRecipeCount > 0;
                  return (
                    <article key={item.id} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTitleBlock}>
                          <div className={styles.rowTop}>
                            <p className={styles.itemKind}>{item.item_kind || "product"}</p>
                            <button className={styles.linkButton} onClick={() => router.push(`/Warehouse_Backoffice/catalog/product?id=${item.id}`)}>
                              Edit product
                            </button>
                            <button className={styles.linkButton} onClick={() => handleDeleteItem(item.id)} disabled={readOnly}>
                              Delete
                            </button>
                          </div>
                          <h2 className={styles.itemName}>{item.name}</h2>
                          {item.sku && <p className={styles.sku}>SKU: {item.sku}</p>}
                        </div>
                        <div className={styles.badges}>
                          <span className={`${styles.badge} ${item.active === false ? styles.badgeMuted : styles.badgeLive}`}>
                            {item.active === false ? "Inactive" : "Active"}
                          </span>
                          <span className={styles.badge}>
                            {itemVariants.length} variant{itemVariants.length === 1 ? "" : "s"}
                          </span>
                          {hasRecipe && (
                            <span className={`${styles.badge} ${styles.badgeRecipe}`}>
                              {baseRecipeCount > 0 ? `Recipes: ${baseRecipeCount}` : "Recipe set"}
                            </span>
                          )}
                          {item.has_variations && <span className={styles.badge}>Has variations</span>}
                          <button className={styles.chipButton} onClick={() => toggleExpanded(item.id)}>
                            {open ? "Hide variants" : "Show variants"}
                          </button>
                        </div>
                      </div>

                      {open && (
                        <div className={styles.variantList}>
                          {itemVariants.length === 0 ? (
                            <p className={styles.empty}>No variants recorded.</p>
                          ) : (
                            itemVariants.map((variant) => (
                              <div key={variant.id} className={styles.variantRow}>
                                <div>
                                  <p className={styles.variantName}>{variant.name}</p>
                                  {variant.sku && <p className={styles.variantSku}>SKU: {variant.sku}</p>}
                                  {variant.supplier_sku && (
                                    <p className={styles.variantSupplierSku}>Supplier SKU: {variant.supplier_sku}</p>
                                  )}
                                </div>
                                <div className={styles.variantActions}>
                                  <span
                                    className={`${styles.badge} ${variant.active === false ? styles.badgeMuted : styles.badgeLive}`}
                                  >
                                    {variant.active === false ? "Inactive" : "Active"}
                                  </span>
                                  {variant.has_recipe && (
                                    <span className={`${styles.badge} ${styles.badgeRecipe}`}>Recipe</span>
                                  )}
                                  <button
                                    className={styles.linkButton}
                                    onClick={() => router.push(`/Warehouse_Backoffice/catalog/variant?id=${variant.id}&item_id=${item.id}`)}
                                  >
                                    Edit
                                  </button>
                                  <button className={styles.linkButton} onClick={() => handleDeleteVariant(variant.id, item.id)} disabled={readOnly}>
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
