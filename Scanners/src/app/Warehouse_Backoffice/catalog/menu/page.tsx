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
type DispatchMode = "send_now" | "schedule" | "delete";
type DispatchStep = 1 | 2 | 3;
type DispatchCandidate = {
  key: string;
  entity_type: "item" | "variant";
  entity_id: string;
  title: string;
  sku: string | null;
  change_type: string;
  updated_at: string | null;
  payload: Record<string, unknown>;
};

const SECTION_HEADERS: Record<string, string> = {
  finished: styles.sectionHeaderFinished,
  ingredient: styles.sectionHeaderIngredient,
  raw: styles.sectionHeaderRaw,
};

function formatCandidateKind(changeType: string) {
  switch (changeType) {
    case "upsert_item":
      return "Product update";
    case "upsert_variant":
      return "Variant update";
    case "delete_item":
      return "Delete product in middleware POS";
    case "delete_variant":
      return "Delete variant in middleware POS";
    default:
      return changeType;
  }
}

function toScheduledIso(dateValue: string, hour12: number, minute: number, amPm: "AM" | "PM") {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map((v) => Number(v));
  if (!year || !month || !day) return null;
  let hour24 = hour12 % 12;
  if (amPm === "PM") hour24 += 12;
  const dt = new Date(year, month - 1, day, hour24, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

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
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchStep, setDispatchStep] = useState<DispatchStep>(1);
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>("send_now");
  const [dispatchCandidates, setDispatchCandidates] = useState<DispatchCandidate[]>([]);
  const [selectedDispatchKeys, setSelectedDispatchKeys] = useState<string[]>([]);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleAmPm, setScheduleAmPm] = useState<"AM" | "PM">("AM");

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

  const loadDispatchCandidates = useCallback(async (mode: DispatchMode) => {
    const res = await fetch(`/api/catalog/update-dispatch?mode=${encodeURIComponent(mode)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Unable to load updates to send");
    }
    const candidates = Array.isArray(json.candidates) ? (json.candidates as DispatchCandidate[]) : [];
    setDispatchCandidates(candidates);
    setSelectedDispatchKeys(candidates.map((candidate) => candidate.key));
  }, []);

  const openDispatchDialog = () => {
    setDispatchOpen(true);
    setDispatchStep(1);
    setDispatchMode("send_now");
    setDispatchCandidates([]);
    setSelectedDispatchKeys([]);
    setScheduleDate("");
    setScheduleHour(9);
    setScheduleMinute(0);
    setScheduleAmPm("AM");
    setError(null);
  };

  const chooseDispatchMode = async (mode: DispatchMode) => {
    setDispatchMode(mode);
    setDispatchBusy(true);
    setError(null);
    try {
      await loadDispatchCandidates(mode);
      setDispatchStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load updates");
    } finally {
      setDispatchBusy(false);
    }
  };

  const submitDispatch = async () => {
    if (!selectedDispatchKeys.length) {
      setError("Select at least one entry.");
      return;
    }

    const scheduledAt =
      dispatchMode === "schedule"
        ? toScheduledIso(scheduleDate, scheduleHour, scheduleMinute, scheduleAmPm)
        : null;
    if (dispatchMode === "schedule" && !scheduledAt) {
      setError("Select a valid schedule date and time.");
      return;
    }

    setDispatchBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/update-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: dispatchMode,
          selected_keys: selectedDispatchKeys,
          scheduled_at: scheduledAt,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Unable to send updates");
      }
      setDispatchOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send updates");
    } finally {
      setDispatchBusy(false);
    }
  };

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
  const selectedCount = selectedDispatchKeys.length;
  const hourAngle = ((scheduleHour % 12) + scheduleMinute / 60) * 30;
  const minuteAngle = scheduleMinute * 6;

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
          <button type="button" className={eb.btnAdd} onClick={() => router.push("/Warehouse_Backoffice/catalog/manage")}>
            Add product
          </button>
          <button type="button" className={eb.btnSecondary} onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className={eb.btnPrimary} onClick={openDispatchDialog} disabled={loading}>
            Send updates
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

      {dispatchOpen ? (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.dialogCard}>
            {dispatchStep === 1 ? (
              <>
                <h3 className={styles.dialogTitle}>Choose dispatch mode</h3>
                <div className={styles.dialogActions}>
                  <button type="button" className={eb.btnPrimary} onClick={() => chooseDispatchMode("send_now")} disabled={dispatchBusy}>
                    Send now
                  </button>
                  <button type="button" className={eb.btnGold} onClick={() => chooseDispatchMode("schedule")} disabled={dispatchBusy}>
                    Schedule
                  </button>
                  <button type="button" className={eb.btnDeduct} onClick={() => chooseDispatchMode("delete")} disabled={dispatchBusy}>
                    Delete
                  </button>
                </div>
              </>
            ) : null}

            {dispatchStep === 2 ? (
              <>
                <h3 className={styles.dialogTitle}>
                  {dispatchMode === "delete" ? "Select products/variants to delete in middleware POS" : "Select updates to dispatch"}
                </h3>
                <div className={styles.dialogList}>
                  {dispatchCandidates.length === 0 ? (
                    <p className={styles.dialogEmpty}>No entries found.</p>
                  ) : (
                    dispatchCandidates.map((candidate) => (
                      <label key={candidate.key} className={styles.dialogRow}>
                        <input
                          type="checkbox"
                          checked={selectedDispatchKeys.includes(candidate.key)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedDispatchKeys((prev) =>
                              checked ? Array.from(new Set([...prev, candidate.key])) : prev.filter((key) => key !== candidate.key)
                            );
                          }}
                        />
                        <span className={styles.dialogRowText}>
                          <strong>{candidate.title}</strong>
                          <span>{formatCandidateKind(candidate.change_type)}</span>
                          <span>{candidate.sku ? `SKU: ${candidate.sku}` : "SKU: —"}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <div className={styles.dialogFooter}>
                  <span className={styles.dialogMeta}>{selectedCount} selected</span>
                  <div className={styles.dialogActions}>
                    <button type="button" className={eb.btnSecondary} onClick={() => setDispatchOpen(false)} disabled={dispatchBusy}>
                      Cancel
                    </button>
                    {dispatchMode === "schedule" ? (
                      <button
                        type="button"
                        className={eb.btnGold}
                        onClick={() => setDispatchStep(3)}
                        disabled={dispatchBusy || selectedCount === 0}
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={dispatchMode === "delete" ? eb.btnDeduct : eb.btnPrimary}
                        onClick={submitDispatch}
                        disabled={dispatchBusy || selectedCount === 0}
                      >
                        {dispatchMode === "delete" ? "Delete" : "Send"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : null}

            {dispatchStep === 3 ? (
              <>
                <h3 className={styles.dialogTitle}>Schedule send</h3>
                <div className={styles.scheduleGrid}>
                  <label className={eb.fieldLabel}>
                    Date
                    <input
                      type="date"
                      className={eb.fieldInput}
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                  </label>

                  <div className={styles.clockPanel}>
                    <div className={styles.clockFace}>
                      <div className={styles.clockCenter} />
                      <div className={styles.clockHandHour} style={{ transform: `translateX(-50%) rotate(${hourAngle}deg)` }} />
                      <div className={styles.clockHandMinute} style={{ transform: `translateX(-50%) rotate(${minuteAngle}deg)` }} />
                    </div>
                    <div className={styles.clockInputs}>
                      <label className={eb.fieldLabel}>
                        Hour
                        <input
                          type="range"
                          min={1}
                          max={12}
                          value={scheduleHour}
                          onChange={(e) => setScheduleHour(Number(e.target.value))}
                        />
                      </label>
                      <label className={eb.fieldLabel}>
                        Minute
                        <input
                          type="range"
                          min={0}
                          max={59}
                          value={scheduleMinute}
                          onChange={(e) => setScheduleMinute(Number(e.target.value))}
                        />
                      </label>
                      <label className={eb.fieldLabel}>
                        AM / PM
                        <select
                          className={eb.fieldSelect}
                          value={scheduleAmPm}
                          onChange={(e) => setScheduleAmPm(e.target.value === "PM" ? "PM" : "AM")}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
                <div className={styles.dialogFooter}>
                  <div className={styles.dialogActions}>
                    <button type="button" className={eb.btnSecondary} onClick={() => setDispatchStep(2)} disabled={dispatchBusy}>
                      Back
                    </button>
                    <button type="button" className={eb.btnGold} onClick={submitDispatch} disabled={dispatchBusy || selectedCount === 0}>
                      Schedule send
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
