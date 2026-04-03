"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
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

type VariantPopover = {
  itemId: string;
  itemName: string;
  itemImageUrl?: string | null;
  variants: Variant[];
  top: number;
  left: number;
  width: number;
};

export default function CatalogMenuPage() {
  const router = useRouter();
  const { status, readOnly, deleteDisabled } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantPopover, setVariantPopover] = useState<VariantPopover | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const variantPopoverRef = useRef<HTMLDivElement | null>(null);

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

  const handleDeleteVariant = useCallback(
    async (variantId: string, itemId: string) => {
      if (!variantId || !itemId) return;
      if (deleteDisabled) {
        setError("Delete access is disabled for this user.");
        return;
      }
      const confirmation = window.prompt("Type YES to confirm deleting this variant.");
      if (!confirmation || confirmation.trim().toLowerCase() !== "yes") {
        return;
      }
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
    [load, deleteDisabled]
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

  const closeVariantPopover = useCallback(() => {
    setVariantPopover(null);
  }, []);

  const openVariantPopover = useCallback(
    (event: MouseEvent<HTMLButtonElement>, item: Item, itemVariants: Variant[]) => {
      if (!itemVariants.length) return;
      if (variantPopover?.itemId === item.id) {
        setVariantPopover(null);
        return;
      }
      const target = event.currentTarget as HTMLElement;
      const card = target.closest("[data-card]") as HTMLElement | null;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const gap = 12;
      const width = 360;
      let left = rect.right + gap;
      if (left + width > window.innerWidth - gap) {
        left = rect.left - width - gap;
      }
      if (left < gap) {
        left = Math.max(gap, window.innerWidth - width - gap);
      }
      const maxHeight = Math.min(420, window.innerHeight - gap * 2);
      let top = rect.top;
      if (top + maxHeight > window.innerHeight - gap) {
        top = Math.max(gap, window.innerHeight - gap - maxHeight);
      }
      setVariantPopover({
        itemId: item.id,
        itemName: item.name ?? "Variants",
        itemImageUrl: item.image_url ?? null,
        variants: itemVariants,
        top,
        left,
        width
      });
    },
    [variantPopover]
  );

  const openPreview = (url: string, label: string) => {
    if (!url) return;
    setPreview({ url, label });
  };

  useEffect(() => {
    if (!variantPopover) return;
    const handleClose = (event?: Event) => {
      if (event && variantPopoverRef.current) {
        const target = event.target as Node | null;
        if (target && variantPopoverRef.current.contains(target)) {
          return;
        }
      }
      setVariantPopover(null);
    };
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [variantPopover]);

  useEffect(() => {
    if (!variantPopover || !variantPopoverRef.current) return;
    variantPopoverRef.current.style.top = `${variantPopover.top}px`;
    variantPopoverRef.current.style.left = `${variantPopover.left}px`;
    variantPopoverRef.current.style.width = `${variantPopover.width}px`;
  }, [variantPopover]);

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
                  const baseRecipeCount = item.base_recipe_count ?? 0;
                  const hasRecipe = baseRecipeCount > 0;
                  const hasVariants = itemVariants.length > 0;
                  const isPopoverOpen = variantPopover?.itemId === item.id;
                  return (
                    <article key={item.id} className={styles.card} data-card>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardMain}>
                          {item.image_url ? (
                            <button
                              type="button"
                              className={`${styles.itemImageWrap} ${styles.imageButton}`}
                              onClick={() => openPreview(item.image_url ?? "", item.name)}
                            >
                              <img className={styles.itemImage} src={item.image_url} alt={item.name} loading="lazy" />
                            </button>
                          ) : null}
                          <div className={styles.cardTitleBlock}>
                          <div className={styles.rowTop}>
                            <p className={styles.itemKind}>{item.item_kind || "product"}</p>
                            <a className={styles.linkButton} href={`/Warehouse_Backoffice/catalog/product?id=${item.id}`}>
                              Edit product
                            </a>
                            <button className={styles.linkButton} onClick={() => handleDeleteItem(item.id)} disabled={readOnly}>
                              Delete
                            </button>
                          </div>
                          <h2 className={styles.itemName}>{item.name}</h2>
                          {item.sku && <p className={styles.sku}>SKU: {item.sku}</p>}
                          </div>
                        </div>
                        <div className={styles.badges}>
                          <span className={`${styles.badge} ${item.active === false ? styles.badgeMuted : styles.badgeLive}`}>
                            {item.active === false ? "Inactive" : "Active"}
                          </span>
                          {hasVariants && (
                            <span className={styles.badge}>
                              {itemVariants.length} variant{itemVariants.length === 1 ? "" : "s"}
                            </span>
                          )}
                          {hasRecipe && (
                            <span className={`${styles.badge} ${styles.badgeRecipe}`}>
                              {`Recipes: ${baseRecipeCount}`}
                            </span>
                          )}
                          {hasVariants && (
                            <button className={styles.chipButton} onClick={(event) => openVariantPopover(event, item, itemVariants)}>
                              {isPopoverOpen ? "Hide variants" : "Show variants"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
            {variantPopover && (
              <div className={styles.variantOverlay} onClick={closeVariantPopover} role="presentation">
                <div
                  className={styles.variantPopover}
                  ref={variantPopoverRef}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={styles.variantPopoverHeader}>
                    <div>
                      <p className={styles.variantPopoverTitle}>{variantPopover.itemName}</p>
                      <p className={styles.variantPopoverMeta}>
                        {variantPopover.variants.length} variant{variantPopover.variants.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button className={styles.variantPopoverClose} onClick={closeVariantPopover} type="button">
                      Close
                    </button>
                  </div>
                  <div className={styles.variantPopoverList}>
                    {variantPopover.variants.map((variant) => (
                      <div key={variant.id} className={styles.variantRow}>
                        <div className={styles.variantInfo}>
                          {(variant.image_url || variantPopover.itemImageUrl) ? (
                            <button
                              type="button"
                              className={`${styles.variantImageWrap} ${styles.imageButton}`}
                              onClick={() =>
                                openPreview(
                                  variant.image_url || variantPopover.itemImageUrl || "",
                                  variant.name || variantPopover.itemName
                                )
                              }
                            >
                              <img
                                className={styles.variantImage}
                                src={variant.image_url || variantPopover.itemImageUrl || ""}
                                alt={variant.name || variantPopover.itemName}
                                loading="lazy"
                              />
                            </button>
                          ) : null}
                          <div>
                            <p className={styles.variantName}>{variant.name}</p>
                            {variant.sku && <p className={styles.variantSku}>SKU: {variant.sku}</p>}
                            {variant.supplier_sku && (
                              <p className={styles.variantSupplierSku}>Supplier SKU: {variant.supplier_sku}</p>
                            )}
                          </div>
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
                          <a
                            className={styles.linkButton}
                            href={`/Warehouse_Backoffice/catalog/variant?id=${variant.id}&item_id=${variantPopover.itemId}`}
                          >
                            Edit
                          </a>
                          <button
                            className={styles.linkButton}
                            onClick={() => handleDeleteVariant(variant.id, variantPopover.itemId)}
                            disabled={readOnly}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {preview && (
              <div className={styles.imageModal} onClick={() => setPreview(null)} role="presentation">
                <div className={styles.imageModalCard} onClick={(event) => event.stopPropagation()}>
                  <div className={styles.imageModalHeader}>
                    <p className={styles.imageModalTitle}>{preview.label}</p>
                    <button className={styles.imageModalClose} onClick={() => setPreview(null)}>
                      Close
                    </button>
                  </div>
                  <img className={styles.imageModalImg} src={preview.url} alt={preview.label} />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
