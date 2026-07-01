"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isMiddlewareCatalogSyncOutlet } from "@/lib/outletScope";
import {
  defaultScheduledLocalValue,
  formatScheduleLabel,
  isFutureSchedule,
  normalizeScheduleInput,
} from "@/lib/catalog-sync-schedule";
import CatalogEntityMultiSelect from "./CatalogEntityMultiSelect";
import { logWarehouseAction } from "./logging";
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

type MenuGroupRow = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active: boolean;
  item_count: number;
  variant_count: number;
};

type PanelMode = "push" | "remove";
type DeliveryMode = "now" | "schedule";

export default function OutletCatalogPushPanel() {
  const [mode, setMode] = useState<PanelMode>("push");
  const [delivery, setDelivery] = useState<DeliveryMode>("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduledLocalValue);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [groups, setGroups] = useState<MenuGroupRow[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [includeEmptyGroups, setIncludeEmptyGroups] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    action: PanelMode;
    delivery: DeliveryMode;
    scheduledAt: string | null;
    syncMode: "insert_only" | "upsert";
    sent: { menu_groups: number; items: number; variants: number; total: number };
    outlets: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [outletsRes, groupsRes] = await Promise.all([
        fetch("/api/outlets?scope=middleware", { cache: "no-store" }),
        fetch("/api/catalog/outlet-catalog-push", { cache: "no-store" }),
      ]);
      const outletsJson = await outletsRes.json().catch(() => ({}));
      const groupsJson = await groupsRes.json().catch(() => ({}));
      if (!outletsRes.ok) {
        throw new Error(outletsJson.error || "Unable to load middleware outlets");
      }
      if (!groupsRes.ok) {
        throw new Error(groupsJson.error || "Unable to load menu groups");
      }
      setOutlets((outletsJson.outlets as OutletRow[]) ?? []);
      setGroups((groupsJson.groups as MenuGroupRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load push settings");
      setOutlets([]);
      setGroups([]);
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

  const preview = useMemo(() => {
    const selectedGroups = groups.filter((group) => selectedGroupIds.includes(group.id));
    return {
      groups: selectedGroups.length,
      items: selectedGroups.reduce((sum, group) => sum + group.item_count, 0),
      variants: selectedGroups.reduce((sum, group) => sum + group.variant_count, 0),
    };
  }, [groups, selectedGroupIds]);

  const runAction = async () => {
    if (!selectedOutletIds.length) {
      setError("Select at least one outlet.");
      return;
    }
    if (!selectedGroupIds.length) {
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
          include_empty_groups: includeEmptyGroups,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || (mode === "remove" ? "Unable to remove catalog" : "Unable to push catalog"));
      }

      setResult({
        action: mode,
        delivery: json.delivery === "schedule" ? "schedule" : "now",
        scheduledAt: typeof json.scheduled_at === "string" ? json.scheduled_at : null,
        syncMode: json.sync_mode === "upsert" ? "upsert" : "insert_only",
        sent: json.sent,
        outlets: json.outlets,
      });

      const selectedOutletNames = middlewareOutlets
        .filter((outlet) => selectedOutletIds.includes(outlet.id))
        .map((outlet) => outlet.name);
      const selectedGroupNames = groups
        .filter((group) => selectedGroupIds.includes(group.id))
        .map((group) => group.name);

      await logWarehouseAction({
        action: WAREHOUSE_AUDIT_ACTIONS.SEND_TO_MIDDLEWARE,
        page: "/Warehouse_Backoffice/catalog/outlet-push",
        method: "POST",
        entity_type: "catalog",
        entity_name: mode === "remove" ? "Menu group catalog remove" : "Menu group catalog push",
        details: {
          mode: mode === "remove" ? "remove_by_groups" : "push_by_groups",
          delivery,
          scheduled_at: delivery === "schedule" ? normalizeScheduleInput(scheduledAtLocal) : null,
          sync_mode: mode === "push" && updateExisting ? "upsert" : "insert_only",
          outlet_ids: selectedOutletIds,
          outlet_names: selectedOutletNames,
          menu_group_ids: selectedGroupIds,
          menu_group_names: selectedGroupNames,
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
            {mode === "push"
              ? "Push menu groups, products, and variants to selected tills. New SKUs are added by default; existing till items stay unchanged unless you enable a full refresh."
              : "Remove selected groups from chosen tills. Central catalog is not changed."}
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
            emptyMessage="No active middleware outlets found."
            getItemLabel={(outlet) => outlet.name ?? outlet.id}
            renderMeta={(outlet) => (outlet.code ? outlet.code : null)}
          />

          <CatalogEntityMultiSelect
            label="Menu groups"
            hint="Finished products and variants in these groups are included."
            placeholder={loading ? "Loading groups…" : "Select menu groups…"}
            items={visibleGroups}
            selectedIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
            disabled={loading || pushing}
            searchable
            searchPlaceholder="Search menu groups…"
            emptyMessage={loading ? "Loading groups…" : "No menu groups with products found."}
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
        </div>

        {preview.groups > 0 ? (
          <div className={styles.summaryBar}>
            <span>
              {mode === "remove" ? "Will remove" : delivery === "schedule" ? "Will schedule" : "Ready to send"}:
            </span>
            <span className={styles.summaryChip}>
              {preview.groups} group{preview.groups === 1 ? "" : "s"}
            </span>
            <span className={styles.summaryChip}>
              {preview.items} product{preview.items === 1 ? "" : "s"}
            </span>
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
          <h4 className={styles.optionsTitle}>Options</h4>
          <div className={styles.optionsGrid}>
            <label className={styles.optionRow}>
              <input
                type="radio"
                name="catalog-delivery"
                checked={delivery === "now"}
                onChange={() => setDelivery("now")}
                disabled={pushing}
              />
              <span>Apply immediately</span>
            </label>
            <label className={styles.optionRow}>
              <input
                type="radio"
                name="catalog-delivery"
                checked={delivery === "schedule"}
                onChange={() => setDelivery("schedule")}
                disabled={pushing}
              />
              <span>
                Schedule for
                <input
                  type="datetime-local"
                  className={styles.scheduleInput}
                  value={scheduledAtLocal}
                  onChange={(event) => setScheduledAtLocal(event.target.value)}
                  disabled={pushing || delivery !== "schedule"}
                />
              </span>
            </label>
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
                    Refresh names and prices for all products in the selected groups.
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className={eb.alertBanner} style={{ marginTop: 16 }}>
            <strong>{mode === "remove" ? "Remove failed:" : "Push failed:"}</strong> {error}
          </div>
        ) : null}

        {result ? (
          <div className={eb.pageCardBody} style={{ marginTop: 16, marginBottom: 0 }}>
            <strong>
              {result.delivery === "schedule"
                ? result.action === "remove"
                  ? "Removal scheduled."
                  : "Send scheduled."
                : result.action === "remove"
                  ? "Removal queued."
                  : "Send queued."}
            </strong>{" "}
            {result.sent.total} event{result.sent.total === 1 ? "" : "s"} ({result.sent.menu_groups} groups,{" "}
            {result.sent.items} products, {result.sent.variants} variants){" "}
            {result.action === "remove" ? "from" : "to"} {result.outlets} outlet
            {result.outlets === 1 ? "" : "s"}
            {result.delivery === "schedule" && result.scheduledAt
              ? ` for ${formatScheduleLabel(result.scheduledAt)}.`
              : "."}
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
