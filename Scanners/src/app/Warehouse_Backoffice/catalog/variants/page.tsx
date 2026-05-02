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
};

type Variant = {
  id: string;
  item_id: string;
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  active?: boolean | null;
};

function CatalogVariantsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemIdFilter = searchParams.get("item_id") ?? "";
  const { status, readOnly, deleteDisabled } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const variantsUrl = itemIdFilter
        ? `/api/catalog/variants?item_id=${encodeURIComponent(itemIdFilter)}`
        : "/api/catalog/variants";
      const [itemsRes, variantsRes] = await Promise.all([fetch("/api/catalog/items"), fetch(variantsUrl)]);
      if (!itemsRes.ok) throw new Error("Unable to load products");
      if (!variantsRes.ok) throw new Error("Unable to load variants");

      const itemsJson = await itemsRes.json();
      const variantsJson = await variantsRes.json();
      setItems(Array.isArray(itemsJson.items) ? itemsJson.items : []);
      setVariants(Array.isArray(variantsJson.variants) ? variantsJson.variants : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load variants");
    } finally {
      setLoading(false);
    }
  }, [itemIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

  const itemMap = useMemo(() => {
    const map = new Map<string, Item>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const filteredVariants = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = variants.filter((variant) => {
      if (itemIdFilter && variant.item_id !== itemIdFilter) return false;
      if (!term) return true;
      const nameMatch = variant.name?.toLowerCase().includes(term);
      const skuMatch = (variant.sku ?? "").toLowerCase().includes(term);
      const parentName = itemMap.get(variant.item_id)?.name?.toLowerCase() ?? "";
      return Boolean(nameMatch || skuMatch || parentName.includes(term));
    });
    return list.sort((a, b) => {
      const left = (a.name ?? "").toLowerCase();
      const right = (b.name ?? "").toLowerCase();
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    });
  }, [variants, search, itemIdFilter, itemMap]);

  const isReady = status === "ok";
  const selectedItemName = itemIdFilter ? itemMap.get(itemIdFilter)?.name ?? "" : "";

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Variants</h1>
            <p className={styles.subtitle}>
              {itemIdFilter && selectedItemName
                ? `Showing variants for ${selectedItemName}.`
                : "Browse variants and edit their details."}
            </p>
            <p className={styles.metaLine}>Showing {filteredVariants.length} variants.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondaryButton} onClick={() => router.back()}>
              Back
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice/catalog/menu")}
            >
              Back to Menu
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice")}
            >
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
                  placeholder="Search by variant or product name / SKU"
                  className={styles.searchInput}
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </section>

            <section className={styles.grid}>
              {filteredVariants.length === 0 && !loading ? (
                <div className={styles.emptyCard}>No variants found.</div>
              ) : (
                filteredVariants.map((variant) => {
                  const parent = itemMap.get(variant.item_id);
                  const parentKind = parent?.item_kind || "product";
                  return (
                    <article key={variant.id} className={styles.card} data-card>
                      <div className={styles.cardHeader}>
                        <p className={`${styles.skuTop} ${!variant.sku ? styles.skuTopMuted : ""}`}>
                          SKU: {variant.sku ?? "-"}
                        </p>
                        <div className={styles.cardTopRow}>
                          <span
                            className={`${styles.statusIcon} ${variant.active === false ? styles.statusInactive : styles.statusActive}`}
                          >
                            <span className={styles.statusMark} />
                          </span>
                          <div className={styles.cardCornerActions}>
                            <a
                              className={styles.iconButton}
                              href={`/Warehouse_Backoffice/catalog/variant?id=${variant.id}&item_id=${variant.item_id}`}
                              aria-label="Edit variant"
                              title="Edit variant"
                            >
                              <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm15.7-9.8a1 1 0 0 0 0-1.4l-2-2a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.5-1.7Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </a>
                          </div>
                        </div>
                        <div className={styles.cardMain}>
                          <div className={styles.cardTitleBlock}>
                            <div className={styles.rowTop}>
                              <p className={styles.itemKind}>{parentKind}</p>
                              {parent?.name && <p className={styles.parentName}>Product: {parent.name}</p>}
                            </div>
                            <h2 className={styles.itemName}>{variant.name}</h2>
                          </div>
                        </div>
                        <button
                          className={`${styles.iconButton} ${styles.deleteButton}`}
                          onClick={() => handleDeleteVariant(variant.id, variant.item_id)}
                          disabled={readOnly}
                          aria-label="Delete variant"
                          title="Delete variant"
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
                })
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function CatalogVariantsPageWrapper() {
  return (
    <Suspense fallback={<div className={styles.page}><main className={styles.shell}>Loading...</main></div>}>
      <CatalogVariantsPage />
    </Suspense>
  );
}
