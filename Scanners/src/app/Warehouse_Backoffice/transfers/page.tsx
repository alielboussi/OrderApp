"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./transfers.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

// Types approximated from the Android WarehousesAdminScreen
interface Warehouse {
  id: string;
  name: string;
}

interface TransferItem {
  id: string;
  product_id?: string | null;
  variant_key?: string | null;
  qty: number;
  product?: { id?: string; name?: string | null; uom?: string | null } | null;
  variation?: { id?: string; name?: string | null; uom?: string | null } | null;
}

interface TransferRow {
  id: string;
  source_location_id?: string | null;
  dest_location_id?: string | null;
  source?: { id?: string; name?: string | null } | null;
  dest?: { id?: string; name?: string | null } | null;
  status?: string | null;
  note?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  reference_code?: string | null;
  operator_name?: string | null;
  items: TransferItem[];
}

const AUTO_REFRESH_MS = 120_000; // 2 minutes
const MAIN_DASHBOARD_PATH = "/Warehouse_Backoffice/transfers";

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

export default function WarehouseTransfersWeb() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
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
  const hasActiveFilters = Boolean(
    sourceId || destId || startDate || endDate || searchQuery.trim()
  );

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

  // Lock URL endpoint to keep kiosk devices on the transfers view
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

  // Keep the top-of-page dashboard buttons visible on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  // Auto refresh every five minutes
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
        const data = await fetchJson<
          Warehouse[] | { warehouses?: Warehouse[]; data?: Warehouse[] }
        >(`/api/warehouses${qs}`);
        const list = normalizeList<Warehouse>(data, ["warehouses", "data"]);
        const filtered = lockedIds.length ? list.filter((w) => lockedIds.includes(w.id)) : list;
        if (fromLocked && filtered.some((w) => w.id === fromLocked)) {
          setSourceId(fromLocked);
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
      setSourceId(lockedFromId.trim());
    }
  }, [lockedFromActive, lockedFromId]);

  const loadTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const fromLocked = lockedFromId.trim();
      const lockedIds = fromLocked ? [fromLocked] : [];
      const params = new URLSearchParams();
      if (sourceId) params.set("sourceId", sourceId);
      if (destId) params.set("destId", destId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      lockedIds.forEach((id) => params.append("fromLockedId", id));
      const url = `/api/warehouse-transfers?${params.toString()}`;
      const data = await fetchJson<
        TransferRow[] | { transfers?: TransferRow[]; data?: TransferRow[] }
      >(url);
      const list = normalizeList<TransferRow>(data, ["transfers", "data"]);
      setTransfers(list);
    } catch (err) {
      setError(normalizeErrorMessage(err) || "Unable to load transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, destId, startDate, endDate, manualRefreshTick, lockedFromId]);

  const filteredTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...transfers].sort((a, b) => {
      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate; // newest first
    });
    const base = q
      ? sorted.filter((t) => {
          const haystack = [
            t.source?.name,
            t.dest?.name,
            t.note,
            t.items
              ?.map(
                (i) =>
                  `${i.product?.name ?? ""} ${i.variation?.name ?? ""} ${i.product_id ?? ""} ${i.variant_key ?? ""}`
              )
              .join(" ") ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : sorted;
    return hasActiveFilters ? base : base.slice(0, 3);
  }, [transfers, searchQuery, hasActiveFilters]);

  const warehouseMap = useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    const map = new Map<string, string>();
    list.forEach((w) => map.set(w.id, w.name));
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
            title="Refresh transfers"
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
          <h1 className={styles.h1}>Warehouse Transfers</h1>
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
            <div className={styles.gridTwo}>
              <LabeledSelect
                label="From warehouse"
                value={lockedFromActive ? lockedFromId : sourceId}
                onChange={setSourceId}
                options={warehouses}
                placeholder={lockedFromActive ? "Locked to source warehouse" : "Any warehouse"}
                locked={lockedFromActive}
              />
              <LabeledSelect
                label="To warehouse"
                value={destId}
                onChange={setDestId}
                options={warehouses}
                placeholder="Any warehouse"
              />
            </div>
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
                  placeholder="Warehouse, product, SKU, note"
                />
              </div>
              <div className={styles.pillRow}>
                <button
                  className={styles.dangerPill}
                  onClick={() => {
                    setSourceId(lockedFromActive ? lockedFromId : "");
                    setDestId("");
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
              {loading && transfers.length === 0 ? (
                <div className={styles.centered}>Loading transfers...</div>
              ) : filteredTransfers.length === 0 ? (
                <div className={styles.centered}>No transfers match the current filters.</div>
              ) : (
                <div className={styles.listScroll}>
                  {filteredTransfers.map((t) => {
                    const sourceName =
                      warehouseMap.get(t.source_location_id ?? "") ||
                      t.source?.name ||
                      t.source_location_id ||
                      "Unknown source";
                    const destName =
                      warehouseMap.get(t.dest_location_id ?? "") ||
                      t.dest?.name ||
                      t.dest_location_id ||
                      "Unknown destination";
                    const expanded = expandedId === t.id;
                    const statusValue = t.status?.toLowerCase() ?? "";
                    const isCompleted = statusValue === "completed";
                    return (
                      <article key={t.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <div className={styles.grow}>
                            <p className={styles.cardTitle}>
                              {sourceName} <span className={styles.muted}>-</span> {destName}
                            </p>
                            <p className={styles.cardSub}>{formatTimestamp(t.created_at)}</p>
                            <p className={styles.cardSub}>Operator: {t.operator_name ?? "Unknown"}</p>
                            {t.reference_code ? (
                              <p className={styles.cardSub}>Ref: {t.reference_code}</p>
                            ) : null}
                          </div>
                          <span className={`${styles.statusChip} ${isCompleted ? styles.statusChipComplete : ""}`}>
                            {titleCase(t.status)}
                          </span>
                          <button
                            className={styles.iconBtn}
                            onClick={() => toggleExpand(t.id)}
                            aria-label="Toggle expand"
                          >
                            {expanded ? "^" : "v"}
                          </button>
                        </div>
                        {t.note && <p className={styles.cardNote}>Note: {t.note}</p>}
                        {t.completed_at && <p className={styles.cardSub}>Completed {formatTimestamp(t.completed_at)}</p>}
                        {expanded && (
                          <div className={styles.itemsBlock}>
                            {t.items?.map((item) => (
                              <div key={item.id} className={styles.itemRow}>
                                <div>
                                  <p className={styles.itemName}>
                                    {item.product?.name ?? "Unknown product"}
                                    {item.variation?.name ? (
                                      <span className={styles.itemSub}> - {item.variation.name}</span>
                                    ) : null}
                                  </p>
                                  <p className={styles.itemSub}>{item.product_id ?? item.variant_key ?? "Item"}</p>
                                </div>
                                <div className={styles.textRight}>
                                  <p className={styles.itemQty}>{item.qty}</p>
                                  <p className={styles.itemSub}>{item.variation?.uom ?? item.product?.uom ?? "units"}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
            <p className={styles.footerText}>Syncs automatically every 5 minutes - Use refresh to pull now</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function LabeledSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Warehouse[];
  placeholder?: string;
  locked?: boolean;
}) {
  const { label, value, onChange, options, placeholder, locked } = props;
  const lockSelection = Boolean(locked && options.length <= 1);
  return (
    <label className={styles.fieldStack}>
      <span className={styles.label}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.select}
        disabled={lockSelection}
      >
        {lockSelection ? null : <option value="">{placeholder ?? "Any"}</option>}
        {options.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabeledDate(props: { label: string; value: string; onChange: (v: string) => void }) {
  const { label, value, onChange } = props;
  return (
    <label className={styles.fieldStack}>
      <span className={styles.label}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.dateInput}
      />
    </label>
  );
}
