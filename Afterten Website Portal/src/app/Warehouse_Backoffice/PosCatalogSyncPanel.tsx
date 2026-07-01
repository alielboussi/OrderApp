"use client";

import { useEffect, useMemo, useState } from "react";
import { isMiddlewareCatalogSyncOutlet } from "@/lib/outletScope";
import type {
  CatalogPushPickerCatalog,
  CatalogPushPickerItem,
  CatalogPushPickerVariant,
  CatalogPushScope,
  MenuGroupPushSummary,
} from "@/lib/catalog-outlet-push";
import CatalogEntityMultiSelect from "./CatalogEntityMultiSelect";
import { formatStamp } from "./middlewareMonitorShared";
import styles from "./enterprise.module.css";
import pickerStyles from "./outletCatalogPush.module.css";

const PREFS_STORAGE_KEY = "warehouse-pos-catalog-sync-prefs";

type OutletRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
};

type ImportSyncPrefs = {
  sync_products: boolean;
  sync_variants: boolean;
  sync_menu_groups: boolean;
  exclude_item_skus: string;
  exclude_variant_skus: string;
};

type SyncDirection = "push" | "import";

function defaultImportSyncPrefs(): ImportSyncPrefs {
  return {
    sync_products: true,
    sync_variants: true,
    sync_menu_groups: true,
    exclude_item_skus: "",
    exclude_variant_skus: "",
  };
}

function defaultPushScope(): CatalogPushScope {
  return { sync_menu_groups: true, sync_products: true, sync_variants: true };
}

function parseSkuCsv(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toUtcIso(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function menuGroupOnlyScope(scope: CatalogPushScope): boolean {
  return scope.sync_menu_groups && !scope.sync_products && !scope.sync_variants;
}

export default function PosCatalogSyncPanel() {
  const [allOutlets, setAllOutlets] = useState<OutletRow[]>([]);
  const [syncDirection, setSyncDirection] = useState<SyncDirection>("push");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    requested: number;
    scheduled_at?: string | null;
    message?: string;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cancelOfflineBusy, setCancelOfflineBusy] = useState(false);
  const [cancelOfflineResult, setCancelOfflineResult] = useState<{
    removed: number;
    offline_outlets: Array<{ outlet_id: string; outlet_name: string }>;
  } | null>(null);
  const [selectedSyncOutletIds, setSelectedSyncOutletIds] = useState<string[]>([]);
  const [importPrefsByOutlet, setImportPrefsByOutlet] = useState<Record<string, ImportSyncPrefs>>({});
  const [syncDialogStep, setSyncDialogStep] = useState<"closed" | "configure" | "schedule">("closed");
  const [syncScheduleLocal, setSyncScheduleLocal] = useState("");
  const [catalogPicker, setCatalogPicker] = useState<CatalogPushPickerCatalog | null>(null);
  const [catalogPickerLoading, setCatalogPickerLoading] = useState(false);
  const [pushScope, setPushScope] = useState<CatalogPushScope>(defaultPushScope);
  const [selectedMenuGroupIds, setSelectedMenuGroupIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [includeEmptyGroups, setIncludeEmptyGroups] = useState(false);
  const [importScope, setImportScope] = useState<ImportSyncPrefs>(defaultImportSyncPrefs);
  const [importExcludeItemSkus, setImportExcludeItemSkus] = useState("");
  const [importExcludeVariantSkus, setImportExcludeVariantSkus] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Partial<ImportSyncPrefs>>;
      const next: Record<string, ImportSyncPrefs> = {};
      for (const [outletId, prefs] of Object.entries(parsed)) {
        next[outletId] = { ...defaultImportSyncPrefs(), ...prefs };
      }
      setImportPrefsByOutlet(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(importPrefsByOutlet));
  }, [importPrefsByOutlet]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/outlets?scope=middleware", { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load outlets");
        const json = await res.json();
        if (!active) return;
        setAllOutlets((json.outlets as OutletRow[]) ?? []);
      } catch {
        if (active) setAllOutlets([]);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const middlewareOutlets = useMemo(
    () =>
      allOutlets
        .filter(isMiddlewareCatalogSyncOutlet)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })),
    [allOutlets]
  );

  const allSyncOutletsSelected =
    middlewareOutlets.length > 0 &&
    middlewareOutlets.every((outlet) => selectedSyncOutletIds.includes(outlet.id));

  const visibleGroups = useMemo(
    () =>
      (catalogPicker?.groups ?? []).filter((group) => includeEmptyGroups || group.item_count > 0),
    [catalogPicker?.groups, includeEmptyGroups]
  );

  const visibleItems = useMemo(() => {
    const items = catalogPicker?.items ?? [];
    if (!selectedMenuGroupIds.length) return items;
    const allowed = new Set(selectedMenuGroupIds);
    return items.filter((item) => item.menu_group_id && allowed.has(item.menu_group_id));
  }, [catalogPicker?.items, selectedMenuGroupIds]);

  const visibleVariants = useMemo(() => {
    const variants = catalogPicker?.variants ?? [];
    const allowedItems = new Set(
      selectedItemIds.length
        ? selectedItemIds
        : visibleItems.map((item) => item.id)
    );
    return variants.filter((variant) => {
      if (selectedMenuGroupIds.length) {
        const groupAllowed = variant.menu_group_id && selectedMenuGroupIds.includes(variant.menu_group_id);
        if (!groupAllowed) return false;
      }
      if (selectedItemIds.length) {
        return allowedItems.has(variant.item_id);
      }
      return true;
    });
  }, [catalogPicker?.variants, selectedItemIds, selectedMenuGroupIds, visibleItems]);

  const pushPreview = useMemo(() => {
    const groupOnly = menuGroupOnlyScope(pushScope);
    const groups = catalogPicker?.groups.filter((group) => selectedMenuGroupIds.includes(group.id)) ?? [];
    if (groupOnly) {
      return {
        groups: groups.length,
        items: groups.reduce((sum, group) => sum + group.item_count, 0),
        variants: groups.reduce((sum, group) => sum + group.variant_count, 0),
      };
    }
    const items =
      selectedItemIds.length > 0
        ? visibleItems.filter((item) => selectedItemIds.includes(item.id))
        : pushScope.sync_products
          ? visibleItems
          : [];
    const variants =
      selectedVariantIds.length > 0
        ? visibleVariants.filter((variant) => selectedVariantIds.includes(variant.id))
        : pushScope.sync_variants
          ? visibleVariants
          : [];
    return {
      groups: pushScope.sync_menu_groups ? selectedMenuGroupIds.length : 0,
      items: pushScope.sync_products ? items.length : 0,
      variants: pushScope.sync_variants ? variants.length : 0,
    };
  }, [
    catalogPicker?.groups,
    pushScope,
    selectedItemIds,
    selectedMenuGroupIds,
    selectedVariantIds,
    visibleItems,
    visibleVariants,
  ]);

  const toggleSyncOutlet = (outletId: string) => {
    setSelectedSyncOutletIds((prev) =>
      prev.includes(outletId) ? prev.filter((id) => id !== outletId) : [...prev, outletId]
    );
  };

  const toggleSelectAllSyncOutlets = (checked: boolean) => {
    setSelectedSyncOutletIds(checked ? middlewareOutlets.map((outlet) => outlet.id) : []);
  };

  const loadCatalogPicker = async () => {
    setCatalogPickerLoading(true);
    try {
      const res = await fetch("/api/catalog/outlet-catalog-push", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Unable to load catalog");
      setCatalogPicker({
        groups: (json.groups as MenuGroupPushSummary[]) ?? [],
        items: (json.items as CatalogPushPickerItem[]) ?? [],
        variants: (json.variants as CatalogPushPickerVariant[]) ?? [],
      });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to load catalog");
      setCatalogPicker(null);
    } finally {
      setCatalogPickerLoading(false);
    }
  };

  const openSyncDialog = async () => {
    if (selectedSyncOutletIds.length === 0) {
      setSyncError("Select at least one outlet to sync.");
      return;
    }
    setSyncError(null);
    setSyncResult(null);
    setSyncScheduleLocal("");
    setPushScope(defaultPushScope());
    setSelectedMenuGroupIds([]);
    setSelectedItemIds([]);
    setSelectedVariantIds([]);
    setUpdateExisting(false);
    setIncludeEmptyGroups(false);
    setImportScope(defaultImportSyncPrefs());
    setImportExcludeItemSkus("");
    setImportExcludeVariantSkus("");
    setSyncDialogStep("configure");
    if (syncDirection === "push") {
      await loadCatalogPicker();
    }
  };

  const validatePushSelection = (): string | null => {
    const groupOnly = menuGroupOnlyScope(pushScope);
    if (groupOnly) {
      if (!selectedMenuGroupIds.length) return "Select at least one menu group.";
      return null;
    }
    if (!selectedMenuGroupIds.length && !selectedItemIds.length && !selectedVariantIds.length) {
      return "Select at least one menu group, product, or variant.";
    }
    if (pushScope.sync_menu_groups && !selectedMenuGroupIds.length) {
      return "Select menu groups or turn off the menu group scope.";
    }
    if (pushScope.sync_products && !selectedMenuGroupIds.length && !selectedItemIds.length) {
      return "Select products or menu groups to sync products.";
    }
    if (pushScope.sync_variants && !selectedMenuGroupIds.length && !selectedItemIds.length && !selectedVariantIds.length) {
      return "Select variants, products, or menu groups to sync variants.";
    }
    return null;
  };

  const runPushSync = async (scheduledAt: string | null = null) => {
    const validationError = validatePushSelection();
    if (validationError) {
      setSyncError(validationError);
      return;
    }

    setSyncBusy(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/catalog/outlet-catalog-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          delivery: scheduledAt ? "schedule" : "now",
          scheduled_at: scheduledAt,
          update_existing: updateExisting,
          outlet_ids: selectedSyncOutletIds,
          menu_group_ids: selectedMenuGroupIds,
          item_ids: selectedItemIds,
          variant_ids: selectedVariantIds,
          include_empty_groups: includeEmptyGroups,
          sync_scope: pushScope,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to push catalog to outlets");
      setSyncResult({
        requested: json.sent?.total ?? 0,
        scheduled_at: json.scheduled_at ?? null,
        message: `Queued ${json.sent?.total ?? 0} events (${json.sent?.menu_groups ?? 0} groups, ${json.sent?.items ?? 0} products, ${json.sent?.variants ?? 0} variants) for ${json.outlets ?? selectedSyncOutletIds.length} outlet(s).`,
      });
      setSyncDialogStep("closed");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to push catalog to outlets");
    } finally {
      setSyncBusy(false);
    }
  };

  const runImportSync = async (scheduledAt: string | null = null) => {
    if (!importScope.sync_products && !importScope.sync_variants && !importScope.sync_menu_groups) {
      setSyncError("Select at least one import scope: products, variants, or menu groups.");
      return;
    }

    setSyncBusy(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const outlet_options: Record<
        string,
        {
          sync_products: boolean;
          sync_variants: boolean;
          sync_menu_groups: boolean;
          exclude_item_skus: string[];
          exclude_variant_skus: string[];
        }
      > = {};

      for (const outletId of selectedSyncOutletIds) {
        const stored = importPrefsByOutlet[outletId];
        outlet_options[outletId] = {
          sync_products: importScope.sync_products,
          sync_variants: importScope.sync_variants,
          sync_menu_groups: importScope.sync_menu_groups,
          exclude_item_skus: parseSkuCsv(importExcludeItemSkus || stored?.exclude_item_skus || ""),
          exclude_variant_skus: parseSkuCsv(importExcludeVariantSkus || stored?.exclude_variant_skus || ""),
        };
      }

      const res = await fetch("/api/catalog/request-pos-catalog-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_ids: selectedSyncOutletIds,
          outlet_options,
          scheduled_at: scheduledAt,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to request POS catalog import");
      setSyncResult({
        requested: json.requested ?? selectedSyncOutletIds.length,
        scheduled_at: json.scheduled_at ?? null,
      });
      setSyncDialogStep("closed");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to request POS catalog import");
    } finally {
      setSyncBusy(false);
    }
  };

  const runSync = (scheduledAt: string | null = null) => {
    if (syncDirection === "push") {
      return runPushSync(scheduledAt);
    }
    return runImportSync(scheduledAt);
  };

  const cancelOfflinePendingSync = async () => {
    setCancelOfflineBusy(true);
    setSyncError(null);
    setCancelOfflineResult(null);
    try {
      const res = await fetch("/api/catalog/cancel-offline-pending-sync", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to clear pending sync for offline outlets");
      setCancelOfflineResult(json);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to clear pending sync for offline outlets");
    } finally {
      setCancelOfflineBusy(false);
    }
  };

  const groupOnly = menuGroupOnlyScope(pushScope);

  return (
    <div>
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Portal/Mintpos Sync
          </h3>
          <p className={styles.pageCardBody} style={{ marginTop: 8 }}>
            Push website catalog to selected tills, or import MintPOS catalog into Supabase. Use{" "}
            <strong>Push to till</strong> for Quick Corner and other middleware outlets after updating products in
            the portal.
          </p>
        </div>

        <div className={`${pickerStyles.modeTabs}`} style={{ marginTop: 12 }} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={syncDirection === "push"}
            className={`${pickerStyles.modeTab} ${syncDirection === "push" ? pickerStyles.modeTabActive : ""}`}
            onClick={() => setSyncDirection("push")}
            disabled={syncBusy}
          >
            Push to till
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={syncDirection === "import"}
            className={`${pickerStyles.modeTab} ${syncDirection === "import" ? pickerStyles.modeTabActive : ""}`}
            onClick={() => setSyncDirection("import")}
            disabled={syncBusy}
          >
            Import from till
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void openSyncDialog()}
            disabled={syncBusy || selectedSyncOutletIds.length === 0}
          >
            {syncBusy ? "Working..." : syncDirection === "push" ? "Sync POS catalog now" : "Import POS catalog now"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={cancelOfflinePendingSync}
            disabled={cancelOfflineBusy || syncBusy}
          >
            {cancelOfflineBusy ? "Clearing..." : "Clear pending sync for offline outlets"}
          </button>
        </div>

        <div className={styles.syncOutletPanel}>
          <label className={styles.syncOutletSelectAll}>
            <input
              type="checkbox"
              checked={allSyncOutletsSelected}
              onChange={(event) => toggleSelectAllSyncOutlets(event.target.checked)}
              disabled={middlewareOutlets.length === 0}
            />
            <span>Select all outlets</span>
          </label>

          {middlewareOutlets.length === 0 ? (
            <p className={styles.pageCardBody} style={{ margin: 0 }}>
              No active middleware outlets found.
            </p>
          ) : (
            <div className={styles.syncOutletList}>
              {middlewareOutlets.map((outlet) => {
                const selected = selectedSyncOutletIds.includes(outlet.id);
                return (
                  <div key={outlet.id} className={styles.syncOutletRow}>
                    <label className={styles.syncOutletLabel}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSyncOutlet(outlet.id)}
                      />
                      <span>
                        <strong>{outlet.name}</strong>
                        {outlet.code ? <span className={styles.syncOutletCode}> · {outlet.code}</span> : null}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {syncError ? (
          <div className={styles.alertBanner} style={{ marginTop: 12 }}>
            <strong>Sync failed:</strong> {syncError}
          </div>
        ) : null}
        {syncResult ? (
          <div className={styles.pageCardBody} style={{ marginTop: 12 }}>
            <strong>{syncResult.scheduled_at ? "Sync scheduled." : "Request sent."}</strong>{" "}
            {syncResult.message ??
              (syncResult.scheduled_at
                ? `POS catalog sync queued for ${syncResult.requested} outlet${syncResult.requested === 1 ? "" : "s"} at ${formatStamp(syncResult.scheduled_at)}.`
                : `Middleware sync events queued for ${syncResult.requested} outlet${syncResult.requested === 1 ? "" : "s"}.`)}
          </div>
        ) : null}
        {cancelOfflineResult ? (
          <div className={styles.pageCardBody} style={{ marginTop: 12 }}>
            <strong>Offline queue cleared.</strong> Removed {cancelOfflineResult.removed} pending event
            {cancelOfflineResult.removed === 1 ? "" : "s"}
            {cancelOfflineResult.offline_outlets.length > 0
              ? ` for ${cancelOfflineResult.offline_outlets.map((row) => row.outlet_name).join(", ")}.`
              : "."}
          </div>
        ) : null}
      </section>

      {syncDialogStep !== "closed" ? (
        <div className={styles.syncDialogOverlay} role="dialog" aria-modal="true">
          <div className={`${styles.syncDialogCard} ${styles.syncDialogCardWide}`}>
            {syncDialogStep === "configure" ? (
              <>
                <h3 className={styles.syncDialogTitle}>
                  {syncDirection === "push" ? "Push catalog to till" : "Import catalog from till"}
                </h3>
                <p className={styles.pageCardBody} style={{ margin: 0 }}>
                  {selectedSyncOutletIds.length} outlet{selectedSyncOutletIds.length === 1 ? "" : "s"} selected.
                </p>

                {syncDirection === "push" ? (
                  <div className={pickerStyles.formGrid} style={{ marginTop: 16 }}>
                    <div className={pickerStyles.field}>
                      <span className={pickerStyles.fieldLabel}>Sync scope</span>
                      <div className={styles.syncShieldToggles}>
                        <label className={styles.syncShieldToggle}>
                          <input
                            type="checkbox"
                            checked={pushScope.sync_menu_groups}
                            onChange={(event) =>
                              setPushScope((prev) => ({ ...prev, sync_menu_groups: event.target.checked }))
                            }
                          />
                          Menu groups
                        </label>
                        <label className={styles.syncShieldToggle}>
                          <input
                            type="checkbox"
                            checked={pushScope.sync_products}
                            onChange={(event) =>
                              setPushScope((prev) => ({ ...prev, sync_products: event.target.checked }))
                            }
                          />
                          Products
                        </label>
                        <label className={styles.syncShieldToggle}>
                          <input
                            type="checkbox"
                            checked={pushScope.sync_variants}
                            onChange={(event) =>
                              setPushScope((prev) => ({ ...prev, sync_variants: event.target.checked }))
                            }
                          />
                          Variants
                        </label>
                      </div>
                      {groupOnly ? (
                        <p className={pickerStyles.fieldHint}>
                          Menu groups only — all products and variants inside the selected groups will sync.
                        </p>
                      ) : null}
                    </div>

                    <CatalogEntityMultiSelect
                      label="Menu groups"
                      hint={
                        groupOnly
                          ? "Required when syncing menu groups only."
                          : "Optional filter — limits products and variants below."
                      }
                      placeholder={catalogPickerLoading ? "Loading…" : "Select menu groups…"}
                      items={visibleGroups}
                      selectedIds={selectedMenuGroupIds}
                      onChange={setSelectedMenuGroupIds}
                      disabled={catalogPickerLoading || syncBusy || !pushScope.sync_menu_groups}
                      searchable
                      searchPlaceholder="Search menu groups…"
                      emptyMessage={catalogPickerLoading ? "Loading…" : "No menu groups found."}
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
                        <label className={pickerStyles.optionRow} style={{ padding: "8px 12px", margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={includeEmptyGroups}
                            onChange={(event) => setIncludeEmptyGroups(event.target.checked)}
                          />
                          <span>Include groups with no products</span>
                        </label>
                      }
                    />

                    {!groupOnly ? (
                      <>
                        <CatalogEntityMultiSelect
                          label="Products"
                          hint="Leave empty to include all products in the selected menu groups."
                          placeholder={catalogPickerLoading ? "Loading…" : "All products in scope"}
                          items={visibleItems}
                          selectedIds={selectedItemIds}
                          onChange={setSelectedItemIds}
                          disabled={catalogPickerLoading || syncBusy || !pushScope.sync_products}
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
                          placeholder={catalogPickerLoading ? "Loading…" : "All variants in scope"}
                          items={visibleVariants}
                          selectedIds={selectedVariantIds}
                          onChange={setSelectedVariantIds}
                          disabled={catalogPickerLoading || syncBusy || !pushScope.sync_variants}
                          searchable
                          searchPlaceholder="Search variants…"
                          emptyMessage="No variants in scope."
                          getItemLabel={(variant) => `${variant.item_name} · ${variant.name}`}
                          renderMeta={(variant) => <>SKU {variant.sku ?? "—"}</>}
                        />
                      </>
                    ) : null}

                    <label className={pickerStyles.optionRow}>
                      <input
                        type="checkbox"
                        checked={updateExisting}
                        onChange={(event) => setUpdateExisting(event.target.checked)}
                        disabled={syncBusy}
                      />
                      <span>
                        Update existing products on tills
                        <span className={pickerStyles.optionHint}>
                          Refresh names and prices for products already on the till.
                        </span>
                      </span>
                    </label>

                    {pushPreview.groups + pushPreview.items + pushPreview.variants > 0 ? (
                      <div className={pickerStyles.summaryBar}>
                        <span>Will queue:</span>
                        {pushPreview.groups > 0 ? (
                          <span className={pickerStyles.summaryChip}>
                            {pushPreview.groups} group{pushPreview.groups === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {pushPreview.items > 0 ? (
                          <span className={pickerStyles.summaryChip}>
                            {pushPreview.items} product{pushPreview.items === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {pushPreview.variants > 0 ? (
                          <span className={pickerStyles.summaryChip}>
                            {pushPreview.variants} variant{pushPreview.variants === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                    <div className={styles.syncShieldToggles}>
                      <label className={styles.syncShieldToggle}>
                        <input
                          type="checkbox"
                          checked={importScope.sync_products}
                          onChange={(event) =>
                            setImportScope((prev) => ({ ...prev, sync_products: event.target.checked }))
                          }
                        />
                        Products
                      </label>
                      <label className={styles.syncShieldToggle}>
                        <input
                          type="checkbox"
                          checked={importScope.sync_variants}
                          onChange={(event) =>
                            setImportScope((prev) => ({ ...prev, sync_variants: event.target.checked }))
                          }
                        />
                        Variants
                      </label>
                      <label className={styles.syncShieldToggle}>
                        <input
                          type="checkbox"
                          checked={importScope.sync_menu_groups}
                          onChange={(event) =>
                            setImportScope((prev) => ({ ...prev, sync_menu_groups: event.target.checked }))
                          }
                        />
                        Menu groups
                      </label>
                    </div>
                    <label className={styles.syncShieldField}>
                      <span>Exclude product SKUs</span>
                      <textarea
                        rows={2}
                        value={importExcludeItemSkus}
                        placeholder="Comma or line separated item SKUs to skip"
                        onChange={(event) => setImportExcludeItemSkus(event.target.value)}
                      />
                    </label>
                    <label className={styles.syncShieldField}>
                      <span>Exclude variant SKUs</span>
                      <textarea
                        rows={2}
                        value={importExcludeVariantSkus}
                        placeholder="Comma or line separated variant SKUs to skip"
                        onChange={(event) => setImportExcludeVariantSkus(event.target.value)}
                      />
                    </label>
                  </div>
                )}

                <div className={styles.syncDialogActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => void runSync(null)}
                    disabled={syncBusy || (syncDirection === "push" && catalogPickerLoading)}
                  >
                    Sync now
                  </button>
                  <button
                    type="button"
                    className={styles.btnGold}
                    onClick={() => setSyncDialogStep("schedule")}
                    disabled={syncBusy}
                  >
                    Schedule
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setSyncDialogStep("closed")}
                    disabled={syncBusy}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className={styles.syncDialogTitle}>Schedule POS catalog sync</h3>
                <label className={styles.pageCardBody} style={{ margin: 0, display: "block" }}>
                  Release time (local)
                  <input
                    className={styles.fieldInput}
                    type="datetime-local"
                    value={syncScheduleLocal}
                    onChange={(event) => setSyncScheduleLocal(event.target.value)}
                    style={{ display: "block", marginTop: 8, width: "100%" }}
                  />
                </label>
                <div className={styles.syncDialogActions}>
                  <button
                    type="button"
                    className={styles.btnGold}
                    onClick={() => {
                      const scheduledAt = toUtcIso(syncScheduleLocal);
                      if (!scheduledAt) {
                        setSyncError("Select a valid future date and time.");
                        return;
                      }
                      void runSync(scheduledAt);
                    }}
                    disabled={syncBusy || !syncScheduleLocal}
                  >
                    Schedule sync
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setSyncDialogStep("configure")}
                    disabled={syncBusy}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
