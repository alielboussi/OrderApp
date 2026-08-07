"use client";

import { useEffect, useMemo, useState } from "react";
import { getWarehouseAccessToken } from "@/lib/warehouse-auth-client";
import { bumpOrderQty } from "@/lib/order-qty-rules";
import {
  applyCatalogProductToOrderItem,
  clonePortalOrderItems,
  getCatalogVariantsForProduct,
  getSupervisorDisplayQtyForOrderItem,
  groupPortalOrderItemsForReview,
  portalOrderItemsMatch,
  resolveSupervisorUomForOrderItem,
  sumPortalOrderItems,
  toPortalOrderItemPayload,
  updatePortalOrderItemQty,
  type PortalCatalogProduct,
  type PortalOrderItem,
} from "@/lib/portal-transfer-order-edit";
import { formatOrdersAppUom } from "@/lib/orders-app-uom";
import { useUomCatalog } from "@/lib/use-uom-options";
import { formatTransferOrderStatus, isPortalTransferOrderEditable } from "@/lib/transfer-order-status";
import styles from "./outlet-orders.module.css";

type OrderExpandPanelProps = {
  orderId: string;
  outletId: string | null;
  status: string | null;
  onSaved: (orderId: string, items: PortalOrderItem[]) => void;
  onError: (message: string) => void;
};

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "K 0";
  return `K ${Math.round(value).toLocaleString("en-US")}`;
}

function normalizeItems(items: PortalOrderItem[]): PortalOrderItem[] {
  return items.map((item, index) => ({
    ...item,
    id: String(item.id ?? `line-${index}`).trim() || `line-${index}`,
    product_id: item.product_id ?? null,
    variant_key: item.variant_key ?? null,
  }));
}

export function OrderExpandPanel({
  orderId,
  outletId,
  status,
  onSaved,
  onError,
}: OrderExpandPanelProps) {
  const editable = isPortalTransferOrderEditable(status);
  const { uoms } = useUomCatalog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [serverItems, setServerItems] = useState<PortalOrderItem[]>([]);
  const [draftItems, setDraftItems] = useState<PortalOrderItem[]>([]);
  const [catalog, setCatalog] = useState<PortalCatalogProduct[]>([]);
  const [variantPickerItemId, setVariantPickerItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setCatalogWarning(null);
        onError("");

        const itemsRes = await fetch(`/api/outlet-orders/${encodeURIComponent(orderId)}/items`, {
          cache: "no-store",
        });
        const itemsJson = (await itemsRes.json()) as { items?: PortalOrderItem[]; error?: string };
        if (!itemsRes.ok) throw new Error(itemsJson.error || "Unable to load order items");

        let catalogRows: PortalCatalogProduct[] = [];
        if (outletId) {
          try {
            const catalogRes = await fetch(
              `/api/outlet-orders/catalog?outlet_id=${encodeURIComponent(outletId)}`,
              { cache: "no-store" },
            );
            const catalogJson = (await catalogRes.json()) as {
              catalog?: PortalCatalogProduct[];
              error?: string;
            };
            if (!catalogRes.ok) {
              throw new Error(catalogJson.error || "Unable to load outlet catalog");
            }
            catalogRows = catalogJson.catalog ?? [];
          } catch (catalogError) {
            if (!active) return;
            setCatalogWarning(
              catalogError instanceof Error
                ? catalogError.message
                : "Outlet catalog could not be loaded. Variant replacement may be unavailable.",
            );
          }
        }

        if (!active) return;
        const items = normalizeItems(itemsJson.items ?? []);
        setServerItems(items);
        setDraftItems(clonePortalOrderItems(items));
        setCatalog(catalogRows);
      } catch (error) {
        if (!active) return;
        onError(error instanceof Error ? error.message : "Unable to load order details");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [editable, onError, orderId, outletId]);

  const hasChanges = useMemo(
    () => editable && !portalOrderItemsMatch(draftItems, serverItems),
    [draftItems, editable, serverItems],
  );

  const totals = useMemo(() => sumPortalOrderItems(draftItems), [draftItems]);

  const productGroups = useMemo(
    () => groupPortalOrderItemsForReview(draftItems, catalog),
    [catalog, draftItems],
  );

  const variantPickerItem = draftItems.find((item) => item.id === variantPickerItemId) ?? null;
  const variantOptions = variantPickerItem
    ? getCatalogVariantsForProduct(catalog, variantPickerItem.product_id ?? "")
    : [];

  function handleQtyBump(item: PortalOrderItem, direction: 1 | -1) {
    setDraftItems((current) => {
      const row = current.find((entry) => entry.id === item.id);
      if (!row) return current;
      const displayQty = getSupervisorDisplayQtyForOrderItem(row, catalog);
      const nextDisplayQty = bumpOrderQty(displayQty, row.product_id, direction);
      return current.map((entry) =>
        entry.id === item.id ? updatePortalOrderItemQty(entry, nextDisplayQty, catalog) : entry,
      );
    });
  }

  async function handleSave() {
    if (!hasChanges) return;
    try {
      setSaving(true);
      onError("");
      const token = await getWarehouseAccessToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`/api/outlet-orders/${encodeURIComponent(orderId)}/items`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: draftItems.map((item) => toPortalOrderItemPayload(item)),
        }),
      });
      const json = (await res.json()) as { items?: PortalOrderItem[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Unable to save order changes");
      const saved = normalizeItems(json.items ?? draftItems);
      setServerItems(clonePortalOrderItems(saved));
      setDraftItems(clonePortalOrderItems(saved));
      onSaved(orderId, saved);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to save order changes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.expandPanel}>
        <p className={styles.expandHint}>Loading order details…</p>
      </div>
    );
  }

  return (
    <div className={styles.expandPanel}>
      {editable ? (
        <p className={styles.expandHint}>
          Tap a variant line to replace it. Use +/− to change quantities, then save.
        </p>
      ) : (
        <p className={styles.expandHint}>
          Order details are read only ({formatTransferOrderStatus(status)}).
        </p>
      )}
      {catalogWarning ? <p className={styles.catalogWarning}>{catalogWarning}</p> : null}

      <div className={styles.detailTable}>
        <div className={`${styles.detailRow} ${styles.detailHead}`}>
          <span>Item</span>
          <span>Qty</span>
          <span>UOM</span>
          <span className={styles.alignRight}>Cost</span>
          <span className={styles.alignRight}>Amount</span>
        </div>

        {productGroups.map((group) => (
          <div key={group.productId} className={styles.productGroup}>
            <div className={styles.productHeader}>{group.productName}</div>
            {group.lines.map((line) => {
              const item = line.item;
              const label = line.showAsVariant ? `(-) ${line.displayLabel}` : line.displayLabel;
              const variantChoices = getCatalogVariantsForProduct(catalog, item.product_id ?? "");
              const canPickVariant = editable && line.showAsVariant && variantChoices.length > 0;
              return (
                <div key={line.key} className={styles.detailRow}>
                  <span>
                    {canPickVariant ? (
                      <button
                        type="button"
                        className={styles.variantButton}
                        onClick={() => setVariantPickerItemId(item.id)}
                      >
                        {label}
                      </button>
                    ) : (
                      label
                    )}
                  </span>
                  <span>
                    {editable ? (
                      <div className={styles.qtyControls}>
                        <button
                          type="button"
                          className={styles.qtyButton}
                          onClick={() => handleQtyBump(item, -1)}
                        >
                          −
                        </button>
                        <span className={styles.qtyValue}>
                          {getSupervisorDisplayQtyForOrderItem(item, catalog)}
                        </span>
                        <button
                          type="button"
                          className={styles.qtyButton}
                          onClick={() => handleQtyBump(item, 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      item.qty ?? 0
                    )}
                  </span>
                  <span>{formatOrdersAppUom(resolveSupervisorUomForOrderItem(item, catalog), item.qty ?? 1, uoms)}</span>
                  <span className={styles.alignRight}>{formatMoney(Number(item.cost ?? 0))}</span>
                  <span className={styles.alignRight}>
                    {formatMoney(Number(item.amount ?? (item.cost ?? 0) * (item.qty ?? 0)))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        <div className={`${styles.detailRow} ${styles.detailTotal}`}>
          <span>Total</span>
          <span>{totals.qty}</span>
          <span />
          <span />
          <span className={styles.alignRight}>{formatMoney(totals.amount)}</span>
        </div>
      </div>

      {editable && hasChanges ? (
        <div className={styles.expandActions}>
          <button
            type="button"
            className={styles.saveButton}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : null}

      {variantPickerItem ? (
        <div className={styles.modalBackdrop} onClick={() => setVariantPickerItemId(null)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h4 className={styles.modalTitle}>Choose variant</h4>
              <button type="button" className={styles.modalClose} onClick={() => setVariantPickerItemId(null)}>
                Close
              </button>
            </div>
            <div className={styles.modalList}>
              {variantOptions.length === 0 ? (
                <p className={styles.expandHint}>No alternate variants available for this product.</p>
              ) : (
                variantOptions.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className={styles.variantOption}
                    onClick={() => {
                      setDraftItems((current) =>
                        current.map((row) =>
                          row.id === variantPickerItem.id
                            ? applyCatalogProductToOrderItem(row, variant)
                            : row,
                        ),
                      );
                      setVariantPickerItemId(null);
                    }}
                  >
                    <span>{variant.name}</span>
                    <span>K{Math.round(variant.selling_price)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
