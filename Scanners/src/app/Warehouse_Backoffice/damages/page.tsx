"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./damages.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";
import type { Warehouse } from "@/types/warehouse";
import type { WarehouseDamage } from "@/types/damages";

const AUTO_REFRESH_MS = 120_000; // 2 minutes
const MAIN_DASHBOARD_PATH = "/Warehouse_Backoffice/damages";
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

function titleCase(value?: string | null) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
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

export default function WarehouseDamagesWeb() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [damages, setDamages] = useState<WarehouseDamage[]>([]);
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
    router.push("/Warehouse_Backoffice");
  };

  const handleBackOne = () => {
    allowNavRef.current = true;
    router.back();
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

  const loadDamages = async () => {
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
      const url = `/api/warehouse-damages?${params.toString()}`;
      const data = await fetchJson<WarehouseDamage[] | { damages?: WarehouseDamage[]; data?: WarehouseDamage[] }>(url);
      const list = normalizeList<WarehouseDamage>(data, ["damages", "data"]);
      setDamages(list);
    } catch (err) {
      setError(normalizeErrorMessage(err) || "Unable to load damages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDamages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, startDate, endDate, manualRefreshTick, lockedFromId]);

  const filteredDamages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...damages].sort((a, b) => {
      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate;
    });
    const base = q
      ? sorted.filter((d) => {
          const haystack = [
            d.warehouse?.name,
            d.note,
            d.items
              ?.map((i) => `${i.item?.name ?? ""} ${i.variant?.name ?? ""} ${i.item_id ?? ""} ${i.variant_key ?? ""}`)
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : sorted;
    return hasActiveFilters ? base : base.slice(0, 3);
  }, [damages, searchQuery, hasActiveFilters]);

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
          <div className={styles.headerButtons}>
            <button className={styles.primaryBtn} onClick={handleBackOne}>
              Back
            </button>
            <button className={styles.primaryBtn} onClick={handleBack}>
              Back to Dashboard
            </button>
          </div>
          <div className={styles.grow} />
          <button
            className={`${styles.iconBtn} ${loading ? styles.iconBtnSpin : ""}`}
            onClick={() => setManualRefreshTick((v) => v + 1)}
            title="Refresh damages"
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
          <h1 className={styles.h1}>Warehouse Damages</h1>
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
                  placeholder="Warehouse, product, note"
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
              {loading && damages.length === 0 ? (
                <div className={styles.centered}>Loading damages...</div>
              ) : filteredDamages.length === 0 ? (
                <div className={styles.centered}>No damages match the current filters.</div>
              ) : (
                <div className={styles.listScroll}>
                  {filteredDamages.map((d) => {
                    const warehouseName = d.warehouse?.name || warehouseMap.get(d.warehouse_id ?? "") || d.warehouse_id || "Unknown warehouse";
                    const expanded = expandedId === d.id;
                    return (
                      <article key={d.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <div className={styles.grow}>
                            <p className={styles.cardTitle}>{warehouseName}</p>
                            <p className={styles.cardSub}>{formatTimestamp(d.created_at)}</p>
                            <p className={styles.cardSub}>Ref: {d.id.slice(0, 8)}</p>
                          </div>
                          <span className={`${styles.statusChip} ${styles.statusChipLogged}`}>
                            {titleCase("logged")}
                          </span>
                          <button
                            className={styles.iconBtn}
                            onClick={() => toggleExpand(d.id)}
                            aria-label="Toggle expand"
                          >
                            {expanded ? "^" : "v"}
                          </button>
                        </div>

                        <p className={styles.cardNote}>{d.note || "No note"}</p>

                        <div className={styles.itemsList}>
                          {(expanded ? d.items : d.items.slice(0, 3)).map((item) => (
                            <div key={item.id} className={styles.itemRow}>
                              <div>
                                <p className={styles.itemTitle}>{item.item?.name ?? "Item"}</p>
                                {item.variant?.name ? <p className={styles.itemSub}>{item.variant.name}</p> : null}
                                {item.note ? <p className={styles.itemSub}>Note: {item.note}</p> : null}
                              </div>
                              <div className={styles.qtyBadge}>- {item.qty}</div>
                            </div>
                          ))}
                        </div>

                        {d.items.length > 3 && (
                          <button className={styles.expandBtn} onClick={() => toggleExpand(d.id)}>
                            {expanded ? "Hide items" : `Show all ${d.items.length} items`}
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
