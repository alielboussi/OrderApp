"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./purchases.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";
import type { Warehouse } from "@/types/warehouse";
import type { WarehousePurchase } from "@/types/purchases";

const AUTO_REFRESH_MS = 120_000; // 2 minutes
const MAIN_DASHBOARD_PATH = "/Warehouse_Backoffice/purchases";
const ALLOWED_FROM_WAREHOUSE_IDS = [
  "f71a25d0-9ec2-454d-a606-93cfaa3c606b", // Beverages Storeroom
  "0c9ddd9e-d42c-475f-9232-5e9d649b0916", // Main Warehouse
];

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
};

function formatDateRangeValue(value?: string | null) {
  return value ?? "";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function currency(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
  return `K ${formatted}`;
}

function normalizeList<T>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const nested = record[key];
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  return [];
}

function normalizeErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  let raw: string;
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "string") {
    raw = err;
  } else {
    try {
      raw = JSON.stringify(err);
    } catch {
      raw = String(err);
    }
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const parsedRecord = parsed as Record<string, unknown>;
      const errorField = parsedRecord.error;
      if (typeof errorField === "string" && errorField.trim()) return errorField;
      if (errorField != null) return String(errorField);
      const messageField = parsedRecord.message;
      if (typeof messageField === "string" && messageField.trim()) return messageField;
      if (messageField != null) return String(messageField);
    }
  } catch {
    // ignore JSON parse failure
  }
  return raw;
}

export default function WarehousePurchasesWeb() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [purchases, setPurchases] = useState<WarehousePurchase[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshTick, setManualRefreshTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const lockedPathRef = useRef<string | null>(null);
  const allowNavRef = useRef(false);
  const [lockedFromId, setLockedFromId] = useState("");
  const lockedFromActive = lockedFromId.trim().length > 0;
  const hasActiveFilters = Boolean(warehouseId || startDate || endDate || searchQuery.trim());

  const readLockedFrom = () => {
    if (typeof window === "undefined") return "";
    const search = new URLSearchParams(window.location.search);
    return (
      search.get("from_locked_id") ||
      search.get("fromLockedId") ||
      search.get("locked_from") ||
      search.get("locked_id") ||
      search.get("lockedWarehouseId") ||
      search.get("lockedWarehouse") ||
      search.get("locked_source_id") ||
      ""
    ).trim();
  };

  const handleBack = () => {
    allowNavRef.current = true;
    router.push("/Warehouse_Backoffice/inventory");
  };

  useEffect(() => {
    setLockedFromId(readLockedFrom());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.location.pathname !== MAIN_DASHBOARD_PATH) {
      allowNavRef.current = true;
      window.history.replaceState({}, "", MAIN_DASHBOARD_PATH);
      allowNavRef.current = false;
    }

    const locked = window.location.pathname + window.location.search;
    lockedPathRef.current = locked;
    const enforce = () => {
      if (allowNavRef.current) return;
      if (window.location.pathname + window.location.search !== lockedPathRef.current) {
        window.history.pushState({}, "", lockedPathRef.current);
      }
    };
    window.addEventListener("popstate", enforce);
    window.addEventListener("hashchange", enforce);
    const id = window.setInterval(enforce, 1500);
    return () => {
      window.removeEventListener("popstate", enforce);
      window.removeEventListener("hashchange", enforce);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setManualRefreshTick((v) => v + 1), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const fromLocked = lockedFromId.trim();
        const lockedIds = fromLocked ? [fromLocked] : [];
        const qs = lockedIds.length ? `?${lockedIds.map((id) => `locked_id=${encodeURIComponent(id)}`).join("&")}` : "";
        const data = await fetchJson<Warehouse[] | { warehouses?: Warehouse[]; data?: Warehouse[] }>(`/api/warehouses${qs}`);
        const list = normalizeList<Warehouse>(data, ["warehouses", "data"]);
        const allowed = list.filter((w) => ALLOWED_FROM_WAREHOUSE_IDS.includes(w.id));
        const filtered = lockedIds.length ? allowed.filter((w) => lockedIds.includes(w.id)) : allowed;
        if (fromLocked && filtered.some((w) => w.id === fromLocked)) {
          setWarehouseId(fromLocked);
        }
        setWarehouses(filtered);
      } catch (err) {
        setError(normalizeErrorMessage(err) || "Unable to load warehouses");
      }
    };
    loadWarehouses();
  }, [lockedFromId]);

  useEffect(() => {
    if (lockedFromActive) {
      setWarehouseId(lockedFromId.trim());
    }
  }, [lockedFromActive, lockedFromId]);

  const loadPurchases = async () => {
    setLoading(true);
    setError(null);
    try {
      const fromLocked = lockedFromId.trim();
      const lockedIds = fromLocked ? [fromLocked] : [];
      const params = new URLSearchParams();
      if (warehouseId) params.set("warehouseId", warehouseId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      lockedIds.forEach((id) => params.append("fromLockedId", id));
      const url = `/api/warehouse-purchases?${params.toString()}`;
      const data = await fetchJson<WarehousePurchase[] | { purchases?: WarehousePurchase[]; data?: WarehousePurchase[] }>(url);
      const list = normalizeList<WarehousePurchase>(data, ["purchases", "data"]);
      setPurchases(list);
    } catch (err) {
      setError(normalizeErrorMessage(err) || "Unable to load purchases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, startDate, endDate, manualRefreshTick, lockedFromId]);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...purchases].sort((a, b) => {
      const aDate = a.recorded_at ? new Date(a.recorded_at).getTime() : 0;
      const bDate = b.recorded_at ? new Date(b.recorded_at).getTime() : 0;
      return bDate - aDate;
    });
    const base = q
      ? sorted.filter((p) => {
          const haystack = [
            p.warehouse?.name,
            p.supplier?.name,
            p.reference_code,
            p.note,
            p.items
              ?.map((i) => `${i.item?.name ?? ""} ${i.variant?.name ?? ""} ${i.item_id ?? ""} ${i.variant_key ?? ""}`)
              .join(" ") ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : sorted;
    return hasActiveFilters ? base : base.slice(0, 3);
  }, [purchases, searchQuery, hasActiveFilters]);

  const warehouseMap = useMemo(() => {
    const map = new Map<string, string>();
    (warehouses ?? []).forEach((w) => {
      if (w?.id) map.set(w.id, w.name ?? "Warehouse");
    });
    return map;
  }, [warehouses]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (status !== "ok") {
    return null;
  }

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <button className={styles.primaryBtn} onClick={handleBack}>
            Back
          </button>
          <div className={styles.grow} />
          <button
            className={`${styles.iconBtn} ${loading ? styles.iconBtnSpin : ""}`}
            onClick={() => setManualRefreshTick((v) => v + 1)}
            title="Refresh purchases"
          >
            Refresh
          </button>
          <button
            className={styles.linkBtn}
            onClick={() => {
              allowNavRef.current = true;
              window.location.href = "/";
            }}
          >
            Log out
          </button>
        </header>

        <section className={styles.stackXs}>
          <h1 className={styles.h1}>Warehouse Purchases</h1>
          <p className={styles.subtle}>Times shown in Zambia Standard Time - CAT (UTC+02)</p>
          <p className={styles.subtle}>Syncs automatically every 5 minutes - Tap refresh for now</p>
        </section>

        {loading && (
          <div className={styles.progressBarWrap}>
            <div className={styles.progressBar} />
          </div>
        )}

        <section className={styles.panel}>
          <div className={styles.stackLg}>
            <LabeledSelect
              label="Warehouse"
              value={lockedFromActive ? lockedFromId : warehouseId}
              onChange={setWarehouseId}
              options={warehouses}
              placeholder={lockedFromActive ? "Locked to source warehouse" : "Any warehouse"}
              locked={lockedFromActive}
            />
            <div className={styles.gridTwo}>
              <LabeledDate label="From date" value={formatDateRangeValue(startDate)} onChange={setStartDate} />
              <LabeledDate label="To date" value={formatDateRangeValue(endDate)} onChange={setEndDate} />
            </div>
            <div className={styles.stackSm}>
              <label className={styles.label}>Search everything</label>
              <div className={styles.searchBox}>
                <input
                  className={styles.searchInput}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Warehouse, supplier, reference, product"
                />
              </div>
              <div className={styles.pillRow}>
                <button
                  className={styles.dangerPill}
                  onClick={() => {
                  setWarehouseId(lockedFromActive ? lockedFromId : "");
                    setStartDate("");
                    setEndDate("");
                    setSearchQuery("");
                    setManualRefreshTick((v) => v + 1);
                  }}
                >
                  Reset all filters
                </button>
              </div>
            </div>
            {error && <p className={styles.errorText}>{error}</p>}
            <div className={styles.listShell}>
              {loading && purchases.length === 0 ? (
                <div className={styles.centered}>Loading purchases...</div>
              ) : filteredPurchases.length === 0 ? (
                <div className={styles.centered}>No purchases match the current filters.</div>
              ) : (
                <div className={styles.listScroll}>
                  {filteredPurchases.map((p) => {
                    const warehouseName = p.warehouse?.name || warehouseMap.get(p.warehouse_id ?? "") || p.warehouse_id || "Warehouse";
                    const supplierName = p.supplier?.name || "Supplier";
                    const expanded = expandedId === p.id;
                    return (
                      <article key={p.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <div className={styles.grow}>
                            <p className={styles.cardTitle}>{warehouseName}</p>
                            <p className={styles.cardSub}>{formatTimestamp(p.recorded_at)}</p>
                            {p.reference_code ? <p className={styles.cardSub}>Ref: {p.reference_code}</p> : null}
                            <p className={styles.cardSub}>Supplier: {supplierName}</p>
                          </div>
                          <span className={`${styles.statusChip} ${styles.statusChipComplete}`}>
                            Received
                          </span>
                          <button
                            className={styles.iconBtn}
                            onClick={() => toggleExpand(p.id)}
                            aria-label="Toggle expand"
                          >
                            {expanded ? "^" : "v"}
                          </button>
                        </div>

                        <p className={styles.cardNote}>{p.note || "No note"}</p>

                        <div className={styles.itemsList}>
                          {(expanded ? p.items : p.items.slice(0, 3)).map((item) => {
                            const lineTotal = item.unit_cost != null ? item.unit_cost * item.qty : null;
                            return (
                              <div key={item.id} className={styles.itemRow}>
                                <div>
                                  <p className={styles.itemTitle}>{item.item?.name ?? "Item"}</p>
                                  {item.variant?.name ? <p className={styles.itemSub}>{item.variant.name}</p> : null}
                                  <p className={styles.itemSub}>Qty: {item.qty}</p>
                                  {item.unit_cost != null ? <p className={styles.itemSub}>Unit cost: {currency(item.unit_cost)}</p> : null}
                                  {lineTotal != null ? <p className={styles.itemSub}>Line total: {currency(lineTotal)}</p> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {p.items.length > 3 && (
                          <button className={styles.expandBtn} onClick={() => toggleExpand(p.id)}>
                            {expanded ? "Hide items" : `Show all ${p.items.length} items`}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  locked,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Warehouse[];
  placeholder?: string;
  locked?: boolean;
}) {
  const lockSelection = Boolean(locked && options.length <= 1);
  const selectId = useId();
  return (
    <div className={styles.fieldStack}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        className={styles.select}
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={lockSelection}
        title={label}
      >
        {lockSelection ? null : <option value="">{placeholder || "Select"}</option>}
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function LabeledDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  return (
    <div className={styles.fieldStack}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        className={styles.dateInput}
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={label}
      />
    </div>
  );
}
