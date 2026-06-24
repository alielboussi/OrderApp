"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isMiddlewareCatalogSyncOutlet } from "@/lib/outletScope";
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

type OutletRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
};

type DeleteTarget =
  | { kind: "item"; item: Item }
  | { kind: "variant"; variant: Variant; item: Item };

type DialogStep = "middleware_confirm" | "select_outlets" | null;

const SECTION_HEADERS: Record<string, string> = {
  finished: styles.sectionHeaderFinished,
  ingredient: styles.sectionHeaderIngredient,
  raw: styles.sectionHeaderRaw,
};

function DeleteIcon() {
  return (
    <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM6 7h12l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProductCard({
  item,
  itemVariants,
  onShowVariants,
  onDeleteItem,
  readOnly,
}: {
  item: Item;
  itemVariants: Variant[];
  onShowVariants: (item: Item, variants: Variant[]) => void;
  onDeleteItem: (item: Item) => void;
  readOnly: boolean;
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
            <div className={styles.titleRow}>
              <h2 className={styles.itemName}>{item.name}</h2>
              {hasVariants ? (
                <button
                  type="button"
                  className={styles.variantsToggle}
                  onClick={() => onShowVariants(item, itemVariants)}
                  aria-label={`Show ${itemVariants.length} variants for ${item.name}`}
                  title={`${itemVariants.length} variant${itemVariants.length === 1 ? "" : "s"}`}
                >
                  <span className={styles.expandTriangle} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.iconButton} ${styles.deleteButton}`}
        onClick={() => onDeleteItem(item)}
        disabled={readOnly}
        aria-label={`Delete ${item.name}`}
        title="Delete product"
      >
        <DeleteIcon />
      </button>
    </article>
  );
}

function VariantsPopup({
  item,
  itemVariants,
  readOnly,
  onClose,
  onDeleteVariant,
}: {
  item: Item;
  itemVariants: Variant[];
  readOnly: boolean;
  onClose: () => void;
  onDeleteVariant: (variant: Variant, item: Item) => void;
}) {
  return (
    <div className={styles.dialogOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialogCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="variants-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="variants-popup-title" className={styles.dialogTitle}>
          {item.name} — variants
        </h3>
        <p className={styles.dialogBody}>
          {itemVariants.length} variant{itemVariants.length === 1 ? "" : "s"}
          {item.sku ? ` · Product SKU: ${item.sku}` : ""}
        </p>
        <ul className={styles.variantList}>
          {itemVariants.map((variant) => (
            <li key={variant.id} className={styles.variantRow}>
              <div className={styles.variantMeta}>
                <p className={styles.variantName}>{variant.name}</p>
                <p className={styles.variantSku}>SKU: {variant.sku ?? "—"}</p>
              </div>
              <div className={styles.rowActions}>
                <a
                  className={styles.iconButton}
                  href={`/Warehouse_Backoffice/catalog/variant?id=${variant.id}&item_id=${variant.item_id}`}
                  aria-label={`Edit ${variant.name}`}
                  title="Edit variant"
                >
                  <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm15.7-9.8a1 1 0 0 0 0-1.4l-2-2a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.5-1.7Z"
                      fill="currentColor"
                    />
                  </svg>
                </a>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.deleteButton}`}
                  style={{ position: "static" }}
                  onClick={() => onDeleteVariant(variant, item)}
                  disabled={readOnly}
                  aria-label={`Delete ${variant.name}`}
                  title="Delete variant"
                >
                  <DeleteIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className={styles.dialogFooter}>
          <button type="button" className={eb.btnSecondary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CatalogMenuPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [middlewareOutlets, setMiddlewareOutlets] = useState<OutletRow[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantsPopup, setVariantsPopup] = useState<ItemWithVariants | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [dialogStep, setDialogStep] = useState<DialogStep>(null);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogSuccess, setDialogSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, variantsRes] = await Promise.all([fetch("/api/catalog/items"), fetch("/api/catalog/variants")]);
      const itemsJson = await itemsRes.json().catch(() => ({}));
      const variantsJson = await variantsRes.json().catch(() => ({}));
      if (!itemsRes.ok) {
        throw new Error(
          typeof itemsJson.error === "string" ? itemsJson.error : "Unable to load products",
        );
      }
      if (!variantsRes.ok) {
        const details =
          variantsJson.details && typeof variantsJson.details === "object"
            ? (variantsJson.details as { message?: string }).message
            : null;
        throw new Error(
          details ||
            (typeof variantsJson.error === "string" ? variantsJson.error : "Unable to load variants"),
        );
      }

      setItems(Array.isArray(itemsJson.items) ? itemsJson.items : []);
      setVariants(Array.isArray(variantsJson.variants) ? variantsJson.variants : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMiddlewareOutlets = useCallback(async () => {
    const res = await fetch("/api/outlets?scope=middleware", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof json.error === "string" ? json.error : "Unable to load middleware outlets");
    }
    const outlets = ((json.outlets as OutletRow[]) ?? []).filter(isMiddlewareCatalogSyncOutlet);
    outlets.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
    return outlets;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (dialogStep !== "select_outlets") return;
    let active = true;
    loadMiddlewareOutlets()
      .then((outlets) => {
        if (!active) return;
        setMiddlewareOutlets(outlets);
        setSelectedOutletIds(outlets.map((outlet) => outlet.id));
      })
      .catch((err) => {
        if (!active) return;
        setDialogError(err instanceof Error ? err.message : "Unable to load outlets");
      });
    return () => {
      active = false;
    };
  }, [dialogStep, loadMiddlewareOutlets]);

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

  const deleteLabel = useMemo(() => {
    if (!deleteTarget) return "";
    if (deleteTarget.kind === "item") return deleteTarget.item.name;
    return `${deleteTarget.variant.name} (variant)`;
  }, [deleteTarget]);

  const openVariantsPopup = (item: Item, itemVariants: Variant[]) => {
    setVariantsPopup({ item, variants: itemVariants });
  };

  const handleDeleteVariantFromPopup = (variant: Variant, item: Item) => {
    setVariantsPopup(null);
    openDeleteDialog({ kind: "variant", variant, item });
  };

  const closeDialog = () => {
    setDialogStep(null);
    setDeleteTarget(null);
    setSelectedOutletIds([]);
    setDialogBusy(false);
    setDialogError(null);
    setDialogSuccess(null);
  };

  const openDeleteDialog = (target: DeleteTarget) => {
    if (readOnly) {
      setError("Delete access is disabled for this user.");
      return;
    }
    setVariantsPopup(null);
    setDeleteTarget(target);
    setDialogStep("middleware_confirm");
    setDialogError(null);
    setDialogSuccess(null);
  };

  const deleteFromCatalog = async () => {
    if (!deleteTarget) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (deleteTarget.kind === "item") {
        const res = await fetch(`/api/catalog/items?id=${encodeURIComponent(deleteTarget.item.id)}`, {
          method: "DELETE",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to delete product");
      } else {
        const res = await fetch(
          `/api/catalog/variants?id=${encodeURIComponent(deleteTarget.variant.id)}&item_id=${encodeURIComponent(deleteTarget.variant.item_id)}`,
          { method: "DELETE" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to delete variant");
      }
      await load();
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const dispatchMiddlewareDelete = async () => {
    if (!deleteTarget) return;
    if (!selectedOutletIds.length) {
      setDialogError("Select at least one outlet.");
      return;
    }

    const selectedKey =
      deleteTarget.kind === "item"
        ? `delete_item:${deleteTarget.item.id}`
        : `delete_variant:${deleteTarget.variant.id}`;

    setDialogBusy(true);
    setDialogError(null);
    try {
      const res = await fetch("/api/catalog/update-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "delete",
          selected_keys: [selectedKey],
          outlet_ids: selectedOutletIds,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Unable to send delete command");
      }

      const outletCount = typeof json.outlets === "number" ? json.outlets : selectedOutletIds.length;
      setDialogSuccess(`Delete command queued for ${outletCount} outlet(s). Middleware will remove it from MintPOS.`);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Unable to send delete command");
    } finally {
      setDialogBusy(false);
    }
  };

  const toggleOutlet = (outletId: string) => {
    setSelectedOutletIds((prev) =>
      prev.includes(outletId) ? prev.filter((id) => id !== outletId) : [...prev, outletId],
    );
  };

  const allOutletsSelected =
    middlewareOutlets.length > 0 && middlewareOutlets.every((outlet) => selectedOutletIds.includes(outlet.id));

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
          <button type="button" className={eb.btnSecondary} onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
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
                        onShowVariants={openVariantsPopup}
                        onDeleteItem={(entry) => openDeleteDialog({ kind: "item", item: entry })}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                </div>
              ),
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
                  onShowVariants={openVariantsPopup}
                  onDeleteItem={(entry) => openDeleteDialog({ kind: "item", item: entry })}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {variantsPopup ? (
        <VariantsPopup
          item={variantsPopup.item}
          itemVariants={variantsPopup.variants}
          readOnly={readOnly}
          onClose={() => setVariantsPopup(null)}
          onDeleteVariant={handleDeleteVariantFromPopup}
        />
      ) : null}

      {dialogStep && deleteTarget ? (
        <div className={styles.dialogOverlay} role="presentation" onClick={closeDialog}>
          <div
            className={styles.dialogCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            {dialogStep === "middleware_confirm" ? (
              <>
                <h3 id="catalog-delete-title" className={styles.dialogTitle}>
                  Delete {deleteLabel}?
                </h3>
                <p className={styles.dialogBody}>
                  Do you want to send this deletion command to outlet middleware? If yes, you can choose which
                  outlets receive the command. If no, the product is removed from the website catalog only.
                </p>
                <div className={styles.dialogActions}>
                  <button type="button" className={eb.btnSecondary} onClick={closeDialog} disabled={dialogBusy}>
                    Cancel
                  </button>
                  <button type="button" className={eb.btnSecondary} onClick={deleteFromCatalog} disabled={dialogBusy}>
                    {dialogBusy ? "Deleting…" : "No — catalog only"}
                  </button>
                  <button
                    type="button"
                    className={eb.btnPrimary}
                    onClick={() => {
                      setDialogStep("select_outlets");
                      setDialogError(null);
                      setDialogSuccess(null);
                    }}
                    disabled={dialogBusy}
                  >
                    Yes — send to middleware
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 id="catalog-delete-title" className={styles.dialogTitle}>
                  Select outlets for deletion
                </h3>
                <p className={styles.dialogBody}>
                  Send delete command for <strong>{deleteLabel}</strong> to the selected middleware outlets.
                </p>

                {middlewareOutlets.length === 0 ? (
                  <p className={styles.dialogEmpty}>No middleware outlets available.</p>
                ) : (
                  <div className={styles.dialogList}>
                    <label className={styles.dialogRow}>
                      <input
                        type="checkbox"
                        checked={allOutletsSelected}
                        onChange={(event) =>
                          setSelectedOutletIds(
                            event.target.checked ? middlewareOutlets.map((outlet) => outlet.id) : [],
                          )
                        }
                      />
                      <span className={styles.dialogRowText}>
                        <strong>Select all outlets</strong>
                      </span>
                    </label>
                    {middlewareOutlets.map((outlet) => (
                      <label key={outlet.id} className={styles.dialogRow}>
                        <input
                          type="checkbox"
                          checked={selectedOutletIds.includes(outlet.id)}
                          onChange={() => toggleOutlet(outlet.id)}
                        />
                        <span className={styles.dialogRowText}>
                          <strong>{outlet.name}</strong>
                          {outlet.code ? <span>Code: {outlet.code}</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className={styles.dialogFooter}>
                  <button
                    type="button"
                    className={eb.btnSecondary}
                    onClick={() => {
                      setDialogStep("middleware_confirm");
                      setDialogError(null);
                      setDialogSuccess(null);
                    }}
                    disabled={dialogBusy}
                  >
                    Back
                  </button>
                  <div className={styles.dialogActions}>
                    <button type="button" className={eb.btnSecondary} onClick={closeDialog} disabled={dialogBusy}>
                      Close
                    </button>
                    <button
                      type="button"
                      className={eb.btnPrimary}
                      onClick={dispatchMiddlewareDelete}
                      disabled={dialogBusy || middlewareOutlets.length === 0}
                    >
                      {dialogBusy ? "Sending…" : "Send delete command"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {dialogError ? <p className={styles.dialogError}>{dialogError}</p> : null}
            {dialogSuccess ? <p className={styles.dialogSuccess}>{dialogSuccess}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
