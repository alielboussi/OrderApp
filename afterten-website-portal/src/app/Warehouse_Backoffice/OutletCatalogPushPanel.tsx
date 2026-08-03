"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMiddlewareCatalogSyncOutlet } from "@/lib/outletScope";
import type {
  CatalogPushPickerItem,
  CatalogPushPickerVariant,
  CatalogPushScope,
  MenuGroupPushSummary,
} from "@/lib/catalog-outlet-push-types";
import {
  defaultScheduledLocalValue,
  formatScheduleLabel,
  isFutureSchedule,
  normalizeScheduleInput,
} from "@/lib/catalog-sync-schedule";
import CatalogEntityMultiSelect from "./CatalogEntityMultiSelect";
import { logWarehouseAction } from "./logging";
import { formatStamp } from "./middlewareMonitorShared";
import { WAREHOUSE_AUDIT_ACTIONS } from "@/lib/warehouse-audit";
import eb from "./enterprise.module.css";
import styles from "./outletCatalogPush.module.css";

type OutletRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
};

type DeliveryPhase = "queued" | "delivering" | "sent" | "scheduled" | "stalled";

type DeliveryTracker = {
  action: PanelMode;
  delivery: DeliveryMode;
  scheduledAt: string | null;
  eventIds: string[];
  total: number;
  pending: number;
  delivered: number;
  lastDeliveredAt: string | null;
  phase: DeliveryPhase;
  outlets: number;
  sent: { menu_groups: number; items: number; variants: number; total: number };
};

const DELIVERY_POLL_MS = 2500;
const DELIVERY_STALL_MS = 5 * 60 * 1000;

type PanelMode = "push" | "remove";
type DeliveryMode = "now" | "schedule";

function defaultPushScope(): CatalogPushScope {
  return { sync_menu_groups: true, sync_products: true, sync_variants: true };
}

export default function OutletCatalogPushPanel() {
  const [mode, setMode] = useState<PanelMode>("push");
  const [delivery, setDelivery] = useState<DeliveryMode>("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduledLocalValue);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [groups, setGroups] = useState<MenuGroupPushSummary[]>([]);
  const [items, setItems] = useState<CatalogPushPickerItem[]>([]);
  const [variants, setVariants] = useState<CatalogPushPickerVariant[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [includeEmptyGroups, setIncludeEmptyGroups] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [cancelOfflineBusy, setCancelOfflineBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOfflineResult, setCancelOfflineResult] = useState<{
    removed: number;
    offline_outlets: Array<{ outlet_id: string; outlet_name: string }>;
  } | null>(null);
  const [result, setResult] = useState<DeliveryTracker | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!result || result.delivery === "schedule" || result.phase === "sent" || result.phase === "scheduled") {
      return;
    }
    if (!result.eventIds.length) return;

    pollStartedAtRef.current = Date.now();
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/catalog/outlet-catalog-push/status?ids=${encodeURIComponent(result.eventIds.join(","))}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const total = typeof json.total === "number" ? json.total : result.total;
        const pending = typeof json.pending === "number" ? json.pending : result.pending;
        const delivered = typeof json.delivered === "number" ? json.delivered : result.delivered;
        const lastDeliveredAt =
          typeof json.last_delivered_at === "string" ? json.last_delivered_at : result.lastDeliveredAt;

        let phase: DeliveryPhase = "queued";
        if (json.complete || (delivered > 0 && pending === 0)) {
          phase = "sent";
        } else if (delivered > 0) {
          phase = "delivering";
        } else if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > DELIVERY_STALL_MS) {
          phase = "stalled";
        }

        setResult((prev) =>
          prev
            ? {
                ...prev,
                total,
                pending,
                delivered,
                lastDeliveredAt,
                phase,
              }
            : prev
        );
      } catch {
        // Keep polling on transient errors.
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), DELIVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [result?.eventIds, result?.delivery, result?.phase]);

  const deliveryProgress = useMemo(() => {
    if (!result || result.total <= 0) return 0;
    return Math.round((result.delivered / result.total) * 100);
  }, [result]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const outletsRes = await fetch("/api/outlets?scope=middleware", { cache: "no-store" });
      const outletsJson = await outletsRes.json().catch(() => ({}));
      if (!outletsRes.ok) {
        throw new Error(outletsJson.error || "Unable to load middleware outlets");
      }
      const loadedOutlets = (outletsJson.outlets as OutletRow[]) ?? [];
      setOutlets(loadedOutlets);
      if (typeof outletsJson.warning === "string" && outletsJson.warning.trim()) {
        setError(outletsJson.warning);
      }

      const catalogRes = await fetch("/api/catalog/outlet-catalog-push", { cache: "no-store" });
      const catalogJson = await catalogRes.json().catch(() => ({}));
      if (!catalogRes.ok) {
        throw new Error(catalogJson.error || "Unable to load catalog");
      }
      setGroups((catalogJson.groups as MenuGroupPushSummary[]) ?? []);
      setItems((catalogJson.items as CatalogPushPickerItem[]) ?? []);
      setVariants((catalogJson.variants as CatalogPushPickerVariant[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load push settings");
      setGroups([]);
      setItems([]);
      setVariants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const middlewareOutlets = useMemo(
    () =>
      outlets
        .filter(isMiddlewareCatalogSyncOutlet)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })),
    [outlets]
  );

  const visibleGroups = useMemo(
    () => (includeEmptyGroups ? groups : groups.filter((group) => group.item_count > 0)),
    [groups, includeEmptyGroups]
  );

  const visibleItems = useMemo(() => {
    if (!selectedGroupIds.length) return items;
    const allowed = new Set(selectedGroupIds);
    return items.filter((item) => item.menu_group_id && allowed.has(item.menu_group_id));
  }, [items, selectedGroupIds]);

  const visibleVariants = useMemo(() => {
    const allowedItems = new Set(
      selectedItemIds.length ? selectedItemIds : visibleItems.map((item) => item.id)
    );
    return variants.filter((variant) => {
      if (selectedGroupIds.length) {
        const groupAllowed = variant.menu_group_id && selectedGroupIds.includes(variant.menu_group_id);
        if (!groupAllowed) return false;
      }
      if (selectedItemIds.length) {
        return allowedItems.has(variant.item_id);
      }
      return true;
    });
  }, [variants, selectedItemIds, selectedGroupIds, visibleItems]);

  const preview = useMemo(() => {
    if (mode === "remove") {
      const selectedGroups = groups.filter((group) => selectedGroupIds.includes(group.id));
      return {
        groups: selectedGroups.length,
        items: selectedGroups.reduce((sum, group) => sum + group.item_count, 0),
        variants: selectedGroups.reduce((sum, group) => sum + group.variant_count, 0),
      };
    }

    const selectedItems =
      selectedItemIds.length > 0
        ? visibleItems.filter((item) => selectedItemIds.includes(item.id))
        : visibleItems;
    const selectedVariants =
      selectedVariantIds.length > 0
        ? visibleVariants.filter((variant) => selectedVariantIds.includes(variant.id))
        : visibleVariants;

    return {
      groups: selectedGroupIds.length,
      items: selectedItems.length,
      variants: selectedVariants.length,
    };
  }, [
    mode,
    groups,
    selectedGroupIds,
    selectedItemIds,
    selectedVariantIds,
    visibleItems,
    visibleVariants,
  ]);

  const validatePushSelection = (): string | null => {
    if (!selectedGroupIds.length && !selectedItemIds.length && !selectedVariantIds.length) {
      return "Select at least one menu group, product, or variant.";
    }
    return null;
  };

  const cancelOfflinePendingSync = async () => {
    setCancelOfflineBusy(true);
    setError(null);
    setCancelOfflineResult(null);
    try {
      const res = await fetch("/api/catalog/cancel-offline-pending-sync", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to clear pending sync for offline outlets");
      setCancelOfflineResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear pending sync for offline outlets");
    } finally {
      setCancelOfflineBusy(false);
    }
  };

  const runAction = async () => {
    if (!selectedOutletIds.length) {
      setError("Select at least one outlet.");
      return;
    }

    if (mode === "push") {
      const validationError = validatePushSelection();
      if (validationError) {
        setError(validationError);
        return;
      }
    } else if (!selectedGroupIds.length) {
      setError("Select at least one menu group.");
      return;
    }

    if (delivery === "schedule") {
      const scheduledAt = normalizeScheduleInput(scheduledAtLocal);
      if (!scheduledAt) {
        setError("Choose a valid schedule date and time.");
        return;
      }
      if (!isFutureSchedule(scheduledAt)) {
        setError("Scheduled date/time must be in the future.");
        return;
      }
    }

    if (mode === "remove") {
      const selectedGroupNames = groups
        .filter((group) => selectedGroupIds.includes(group.id))
        .map((group) => group.name)
        .join(", ");
      const outletCount = selectedOutletIds.length;
      const scheduleNote =
        delivery === "schedule" && scheduledAtLocal
          ? `\n\nScheduled for ${formatScheduleLabel(normalizeScheduleInput(scheduledAtLocal) ?? scheduledAtLocal)}.`
          : "";
      const confirmed = window.confirm(
        `Remove ${selectedGroupIds.length} menu group${selectedGroupIds.length === 1 ? "" : "s"} from ${outletCount} outlet${outletCount === 1 ? "" : "s"}?\n\n` +
          `Groups: ${selectedGroupNames}\n\n` +
          "This deletes the group, its products, and variants from the till POS only. The central catalog is not changed." +
          scheduleNote
      );
      if (!confirmed) return;
    }

    setPushing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/catalog/outlet-catalog-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          delivery,
          scheduled_at: delivery === "schedule" ? scheduledAtLocal : null,
          update_existing: mode === "push" ? updateExisting : false,
          outlet_ids: selectedOutletIds,
          menu_group_ids: selectedGroupIds,
          item_ids: mode === "push" ? selectedItemIds : [],
          variant_ids: mode === "push" ? selectedVariantIds : [],
          include_empty_groups: includeEmptyGroups,
          sync_scope: mode === "push" ? defaultPushScope() : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || (mode === "remove" ? "Unable to remove catalog" : "Unable to push catalog"));
      }

      const eventIds = Array.isArray(json.event_ids)
        ? json.event_ids.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))
        : [];

      const tracker: DeliveryTracker = {
        action: mode,
        delivery: json.delivery === "schedule" ? "schedule" : "now",
        scheduledAt: typeof json.scheduled_at === "string" ? json.scheduled_at : null,
        eventIds,
        total: json.sent?.total ?? 0,
        pending: json.sent?.total ?? 0,
        delivered: 0,
        lastDeliveredAt: null,
        phase: json.delivery === "schedule" ? "scheduled" : "queued",
        outlets: json.outlets ?? 0,
        sent: json.sent ?? { menu_groups: 0, items: 0, variants: 0, total: 0 },
      };
      setResult(tracker);

      const selectedOutletNames = middlewareOutlets
        .filter((outlet) => selectedOutletIds.includes(outlet.id))
        .map((outlet) => outlet.name);
      const selectedGroupNames = groups
        .filter((group) => selectedGroupIds.includes(group.id))
        .map((group) => group.name);

      await logWarehouseAction({
        action: WAREHOUSE_AUDIT_ACTIONS.SEND_TO_MIDDLEWARE,
        page: "/Warehouse_Backoffice/middleware",
        method: "POST",
        entity_type: "catalog",
        entity_name: mode === "remove" ? "Menu group catalog remove" : "Catalog push to middleware",
        details: {
          mode: mode === "remove" ? "remove_by_groups" : "push",
          delivery,
          scheduled_at: delivery === "schedule" ? normalizeScheduleInput(scheduledAtLocal) : null,
          sync_mode: mode === "push" && updateExisting ? "upsert" : "insert_only",
          sync_scope: mode === "push" ? defaultPushScope() : null,
          outlet_ids: selectedOutletIds,
          outlet_names: selectedOutletNames,
          menu_group_ids: selectedGroupIds,
          menu_group_names: selectedGroupNames,
          item_ids: mode === "push" ? selectedItemIds : [],
          variant_ids: mode === "push" ? selectedVariantIds : [],
          sent: json.sent,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "remove"
            ? "Unable to remove catalog"
            : "Unable to push catalog"
      );
    } finally {
      setPushing(false);
    }
  };

  const actionLabel = pushing
    ? mode === "remove"
      ? delivery === "schedule"
        ? "Scheduling removal…"
        : "Removing…"
      : delivery === "schedule"
        ? "Scheduling…"
        : "Sending…"
    : mode === "remove"
      ? delivery === "schedule"
        ? "Schedule removal"
        : "Remove from outlets"
      : delivery === "schedule"
        ? "Schedule send"
        : "Send to outlets";

  return (
    <div className={styles.page}>
      <section className={`${eb.pageCard} ${styles.hero}`}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Send to Middleware
          </h3>
          <p className={eb.pageCardBody} style={{ marginTop: 8, marginBottom: 0 }}>
            Push portal catalog updates (menu groups, products, variants, prices) to selected tills, or remove
            groups from a till. Send immediately or schedule a date and time.
          </p>
        </div>

        <div className={styles.heroBody}>
          <div className={styles.modeTabs} role="tablist" aria-label="Catalog action">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "push"}
              className={`${styles.modeTab} ${mode === "push" ? styles.modeTabActive : ""}`}
              onClick={() => {
                setMode("push");
                setError(null);
                setResult(null);
              }}
              disabled={pushing}
            >
              Send to outlets
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "remove"}
              className={`${styles.modeTab} ${mode === "remove" ? styles.modeTabActive : ""}`}
              onClick={() => {
                setMode("remove");
                setUpdateExisting(false);
                setError(null);
                setResult(null);
              }}
              disabled={pushing}
            >
              Remove from outlets
            </button>
          </div>

          <div className={styles.heroToolbar}>
            <button
              type="button"
              className={eb.btnSecondary}
              onClick={() => void cancelOfflinePendingSync()}
              disabled={cancelOfflineBusy || pushing}
            >
              {cancelOfflineBusy ? "Clearing…" : "Clear pending sync for offline outlets"}
            </button>
          </div>

          {cancelOfflineResult ? (
            <p className={`${eb.pageCardBody} ${styles.heroMessage}`}>
              <strong>Offline queue cleared.</strong> Removed {cancelOfflineResult.removed} pending event
              {cancelOfflineResult.removed === 1 ? "" : "s"}
              {cancelOfflineResult.offline_outlets.length > 0
                ? ` for ${cancelOfflineResult.offline_outlets.map((row) => row.outlet_name).join(", ")}.`
                : "."}
            </p>
          ) : null}
        </div>
      </section>

      <section className={`${eb.pageCard} ${styles.formCard}`}>
        <div className={styles.formGrid}>
          <CatalogEntityMultiSelect
            label="Outlets"
            hint="Middleware-enabled tills to receive this catalog action."
            placeholder={loading ? "Loading outlets…" : "Select outlets…"}
            items={middlewareOutlets}
            selectedIds={selectedOutletIds}
            onChange={setSelectedOutletIds}
            disabled={loading || pushing}
            emptyMessage={
              loading
                ? "Loading outlets…"
                : outlets.length > 0
                  ? "No middleware outlets match the catalog filter."
                  : "No middleware outlets found. In Firestore, set has_pos_middleware = true on Till 1, Till 2, and Quick Corner."
            }
            getItemLabel={(outlet) => outlet.name ?? outlet.id}
            renderMeta={(outlet) => (outlet.code ? outlet.code : null)}
          />

          <CatalogEntityMultiSelect
            label="Menu groups"
            hint={
              mode === "remove"
                ? "Groups to remove from the selected tills."
                : "Optional filter — limits products and variants below."
            }
            placeholder={loading ? "Loading groups…" : "Select menu groups…"}
            items={visibleGroups}
            selectedIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
            disabled={loading || pushing}
            searchable
            searchPlaceholder="Search menu groups…"
            emptyMessage={
              loading
                ? "Loading groups…"
                : groups.length > 0
                  ? "No groups with pushable products. Tick “Include groups with no products” or assign finished products (with SKU) to a menu group."
                  : "No menu groups in catalog. Add groups under Catalog → Menu groups."
            }
            getItemLabel={(group) => group.name}
            renderMeta={(group) => (
              <>
                MintPOS ID {group.pos_menu_group_id ?? "—"} · {group.item_count} product
                {group.item_count === 1 ? "" : "s"}
                {group.variant_count > 0
                  ? ` · ${group.variant_count} variant${group.variant_count === 1 ? "" : "s"}`
                  : ""}
              </>
            )}
            toolbarExtra={
              <label className={styles.optionRow} style={{ padding: "8px 12px", margin: 0 }}>
                <input
                  type="checkbox"
                  checked={includeEmptyGroups}
                  onChange={(event) => setIncludeEmptyGroups(event.target.checked)}
                />
                <span>Include groups with no products</span>
              </label>
            }
          />

          {mode === "push" ? (
            <>
              <CatalogEntityMultiSelect
                label="Products"
                hint="Leave empty to include all products in the selected menu groups."
                placeholder={loading ? "Loading…" : "All products in scope"}
                items={visibleItems}
                selectedIds={selectedItemIds}
                onChange={setSelectedItemIds}
                disabled={loading || pushing}
                searchable
                searchPlaceholder="Search products…"
                emptyMessage="No products in scope."
                getItemLabel={(item) => item.name}
                renderMeta={(item) => (
                  <>
                    SKU {item.sku ?? "—"}
                    {item.menu_group_name ? ` · ${item.menu_group_name}` : ""}
                  </>
                )}
              />

              <CatalogEntityMultiSelect
                label="Variants"
                hint="Leave empty to include all variants for the selected products or groups."
                placeholder={loading ? "Loading…" : "All variants in scope"}
                items={visibleVariants}
                selectedIds={selectedVariantIds}
                onChange={setSelectedVariantIds}
                disabled={loading || pushing}
                searchable
                searchPlaceholder="Search variants…"
                emptyMessage="No variants in scope."
                getItemLabel={(variant) => `${variant.item_name} · ${variant.name}`}
                renderMeta={(variant) => <>SKU {variant.sku ?? "—"}</>}
              />
            </>
          ) : null}
        </div>

        {preview.groups + preview.items + preview.variants > 0 ? (
          <div className={styles.summaryBar}>
            <span>
              {mode === "remove" ? "Will remove" : delivery === "schedule" ? "Will schedule" : "Ready to send"}:
            </span>
            {preview.groups > 0 ? (
              <span className={styles.summaryChip}>
                {preview.groups} group{preview.groups === 1 ? "" : "s"}
              </span>
            ) : null}
            {preview.items > 0 ? (
              <span className={styles.summaryChip}>
                {preview.items} product{preview.items === 1 ? "" : "s"}
              </span>
            ) : null}
            {preview.variants > 0 ? (
              <span className={styles.summaryChip}>
                {preview.variants} variant{preview.variants === 1 ? "" : "s"}
              </span>
            ) : null}
            <span className={styles.summaryChip}>
              {selectedOutletIds.length} outlet{selectedOutletIds.length === 1 ? "" : "s"}
            </span>
            {mode === "push" && !updateExisting ? (
              <span className={styles.summaryChip}>New SKUs only</span>
            ) : null}
            {mode === "push" && updateExisting ? (
              <span className={styles.summaryChip}>Full refresh</span>
            ) : null}
            {delivery === "schedule" && scheduledAtLocal ? (
              <span style={{ color: "#57606a" }}>
                · {formatScheduleLabel(normalizeScheduleInput(scheduledAtLocal) ?? scheduledAtLocal)}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className={styles.optionsSection}>
          <h4 className={styles.optionsTitle}>Delivery</h4>
          <div className={styles.optionsGrid}>
            <label className={styles.optionRow}>
              <input
                type="radio"
                name="catalog-delivery"
                checked={delivery === "now"}
                onChange={() => setDelivery("now")}
                disabled={pushing}
              />
              <span>Send immediately</span>
            </label>
            <label className={styles.optionRow}>
              <input
                type="radio"
                name="catalog-delivery"
                checked={delivery === "schedule"}
                onChange={() => setDelivery("schedule")}
                disabled={pushing}
              />
              <span>Schedule for date &amp; time</span>
            </label>
            {delivery === "schedule" ? (
              <label className={styles.optionRow} style={{ gridColumn: "1 / -1" }}>
                <span className={styles.fieldLabel}>Scheduled release (local time)</span>
                <input
                  type="datetime-local"
                  className={styles.scheduleInput}
                  value={scheduledAtLocal}
                  onChange={(event) => setScheduledAtLocal(event.target.value)}
                  disabled={pushing}
                />
              </label>
            ) : null}
            {mode === "push" ? (
              <label className={styles.optionRow}>
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(event) => setUpdateExisting(event.target.checked)}
                  disabled={pushing}
                />
                <span>
                  Update existing products on tills
                  <span className={styles.optionHint}>
                    Refresh names and prices for products already on the till.
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className={`${eb.alertBanner} ${eb.alertRed} ${styles.formFeedback}`}>
            <strong>{mode === "remove" ? "Remove failed:" : "Push failed:"}</strong> {error}
          </div>
        ) : null}

        {result ? (
          <div className={`${styles.deliveryTracker} ${styles[`deliveryPhase_${result.phase}`] ?? ""}`}>
            <div className={styles.deliverySteps} aria-label="Catalog delivery progress">
              <span className={result.phase === "queued" ? styles.deliveryStepActive : styles.deliveryStepDone}>
                Queued
              </span>
              <span className={styles.deliveryStepDivider} aria-hidden="true" />
              <span
                className={
                  result.phase === "delivering"
                    ? styles.deliveryStepActive
                    : result.phase === "sent"
                      ? styles.deliveryStepDone
                      : styles.deliveryStepPending
                }
              >
                Delivering
              </span>
              <span className={styles.deliveryStepDivider} aria-hidden="true" />
              <span className={result.phase === "sent" ? styles.deliveryStepActive : styles.deliveryStepPending}>
                Sent to till
              </span>
            </div>

            {result.delivery === "now" ? (
              <div className={styles.deliveryProgressTrack} aria-hidden="true">
                <div className={styles.deliveryProgressFill} style={{ width: `${deliveryProgress}%` }} />
              </div>
            ) : null}

            <p className={styles.deliveryMessage}>
              {result.phase === "scheduled" ? (
                <>
                  <strong>Scheduled.</strong> {result.sent.total} event{result.sent.total === 1 ? "" : "s"} (
                  {result.sent.menu_groups} groups, {result.sent.items} products, {result.sent.variants} variants){" "}
                  {result.action === "remove" ? "from" : "to"} {result.outlets} outlet
                  {result.outlets === 1 ? "" : "s"}
                  {result.scheduledAt ? ` for ${formatStamp(result.scheduledAt)}.` : "."}
                </>
              ) : result.phase === "sent" ? (
                <>
                  <strong>Sent to till.</strong> {result.delivered} of {result.total} event
                  {result.total === 1 ? "" : "s"} delivered
                  {result.lastDeliveredAt ? ` at ${formatStamp(result.lastDeliveredAt)}` : ""} (
                  {result.sent.menu_groups} groups, {result.sent.items} products, {result.sent.variants} variants){" "}
                  {result.action === "remove" ? "from" : "to"} {result.outlets} outlet
                  {result.outlets === 1 ? "" : "s"}.
                </>
              ) : result.phase === "delivering" ? (
                <>
                  <strong>Delivering to till…</strong> {result.delivered} of {result.total} event
                  {result.total === 1 ? "" : "s"} applied ({result.pending} pending).
                </>
              ) : result.phase === "stalled" ? (
                <>
                  <strong>Still waiting on middleware.</strong> {result.pending} of {result.total} event
                  {result.total === 1 ? "" : "s"} not delivered yet. Check SCPGT is running on the till and the outlet
                  is online in Middleware status above.
                </>
              ) : (
                <>
                  <strong>Queued.</strong> {result.sent.total} event{result.sent.total === 1 ? "" : "s"} (
                  {result.sent.menu_groups} groups, {result.sent.items} products, {result.sent.variants} variants){" "}
                  {result.action === "remove" ? "from" : "to"} {result.outlets} outlet
                  {result.outlets === 1 ? "" : "s"} — waiting for till middleware to pick them up.
                </>
              )}
            </p>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={`${mode === "remove" ? eb.btnSecondary : eb.btnPrimary} ${mode === "remove" ? styles.removeAction : ""}`}
            onClick={() => void runAction()}
            disabled={pushing || loading}
          >
            {actionLabel}
          </button>
          <button type="button" className={eb.btnSecondary} onClick={() => void load()} disabled={loading || pushing}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </section>
    </div>
  );
}
