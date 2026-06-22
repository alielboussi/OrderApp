"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";
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

const SECTION_HEADERS: Record<string, string> = {
  finished: styles.sectionHeaderFinished,
  ingredient: styles.sectionHeaderIngredient,
  raw: styles.sectionHeaderRaw,
};

function ProductCard({
  item,
  itemVariants,
  onVariants,
}: {
  item: Item;
  itemVariants: Variant[];
  onVariants: (id: string) => void;
}) {
  const hasVariants = itemVariants.length > 0;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={`${styles.skuTop} ${!item.sku ? styles.skuTopMuted : ""}`}>SKU: {item.sku ?? "—"}</p>
        <div className={styles.cardTopRow}>
          <span
            className={`${styles.statusIcon} ${item.active === false ? styles.statusInactive : styles.statusActive}`}
            title={item.active === false ? "Inactive" : "Active"}
          >
            <span className={styles.statusMark} />
          </span>
          <div className={styles.cardCornerActions}>
            <button
              className={styles.cornerButton}
              onClick={() => onVariants(item.id)}
              type="button"
              aria-label="View variants"
              disabled={!hasVariants}
              title={hasVariants ? "View variants" : "No variants"}
            >
              <span className={styles.triangleIcon} />
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
      </div>
    </article>
  );
}

export default function CatalogMenuPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
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
        { key: "finished", label: "Finished products" },
        { key: "ingredient", label: "Ingredients" },
        { key: "raw", label: "Raws" },
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

  const openVariants = (itemId: string) => {
    router.push(`/Warehouse_Backoffice/catalog/variants?item_id=${encodeURIComponent(itemId)}`);
  };

  if (!isReady) {
    return (
      <section className={eb.pageCard}>
        <p className={eb.pageCardBody}>Not authorized for catalog.</p>
      </section>
    );
  }

  return (
    <div>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Catalog menu
          </h3>
          <p className={eb.pageCardBody}>
            Browse products and variants. Showing {items.length} products and {variantCount} variants.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={eb.btnAdd} onClick={() => router.push("/Warehouse_Backoffice/catalog/product")}>
            Add Products
          </button>
          <button type="button" className={eb.btnSecondary} onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className={eb.btnSecondary} onClick={() => router.push("/Warehouse_Backoffice/catalog/menu-groups")}>
            Menu groups
          </button>
        </div>
        <div className={eb.summaryGrid} style={{ marginTop: 16 }}>
          <div className={`${eb.summaryCard} ${eb.summaryCardBlue}`}>
            <p className={eb.summaryLabel}>Products</p>
            <p className={eb.summaryValue}>{items.length}</p>
          </div>
          <div className={`${eb.summaryCard} ${eb.summaryCardGreen}`}>
            <p className={eb.summaryLabel}>Variants</p>
            <p className={eb.summaryValue}>{variantCount}</p>
          </div>
        </div>
      </section>

      <section className={eb.pageCard}>
        <div className={eb.filterBar}>
          <label className={eb.fieldLabel}>
            Search
            <input
              id="catalog-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product or variant name / SKU"
              className={eb.fieldInput}
            />
          </label>
          <label className={eb.fieldLabel}>
            Product type
            <select
              id="product-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={eb.fieldSelect}
            >
              <option value="all">All types</option>
              {itemKindOptions.map((kind) => (
                <option key={kind} value={kind.toLowerCase()}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
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
            groupedData.sections.map((section) =>
              section.entries.length === 0 ? null : (
                <div key={section.key} className={styles.sectionBlock}>
                  <p className={SECTION_HEADERS[section.key] ?? styles.sectionHeaderFinished}>{section.label}</p>
                  <div className={styles.sectionGrid}>
                    {section.entries.map(({ item, variants: itemVariants }) => (
                      <ProductCard
                        key={item.id}
                        item={item}
                        itemVariants={itemVariants}
                        onVariants={openVariants}
                      />
                    ))}
                  </div>
                </div>
              )
            )
          )
        ) : (
          <div className={styles.sectionBlock}>
            <div className={styles.sectionGrid}>
              {groupedData.entries.map(({ item, variants: itemVariants }) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  itemVariants={itemVariants}
                  onVariants={openVariants}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
