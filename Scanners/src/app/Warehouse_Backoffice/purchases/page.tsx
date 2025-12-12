"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
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
              ?.map((i) => `${i.item?.name ?? ""} ${i.variant?.name ?? ""} ${i.item_id ?? ""} ${i.variant_id ?? ""}`)
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
    <div style={styles.page}>
      <style>{globalStyles}</style>
      <main style={styles.shell}>
        <header style={styles.header}>
          <button style={styles.primaryBtn} onClick={handleBack}>
            Back
          </button>
          <div style={{ flex: 1 }} />
          <button
            style={{ ...styles.iconBtn, ...(loading ? styles.iconBtnSpin : null) }}
            onClick={() => setManualRefreshTick((v) => v + 1)}
            title="Refresh purchases"
          >
            Refresh
          </button>
          <button
            style={styles.linkBtn}
            onClick={() => {
              allowNavRef.current = true;
              window.location.href = "/";
            }}
          >
            Log out
          </button>
        </header>

        <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={styles.h1}>Warehouse Purchases</h1>
          <p style={styles.subtle}>Times shown in Zambia Standard Time - CAT (UTC+02)</p>
          <p style={styles.subtle}>Syncs automatically every 5 minutes - Tap refresh for now</p>
        </section>

        {loading && (
          <div style={styles.progressBarWrap}>
            <div style={styles.progressBar} />
          </div>
        )}

        <section style={styles.panel}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <LabeledSelect
              label="Warehouse"
              value={lockedFromActive ? lockedFromId : warehouseId}
              onChange={setWarehouseId}
              options={warehouses}
              placeholder={lockedFromActive ? "Locked to source warehouse" : "Any warehouse"}
              locked={lockedFromActive}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <LabeledDate label="From date" value={formatDateRangeValue(startDate)} onChange={setStartDate} />
              <LabeledDate label="To date" value={formatDateRangeValue(endDate)} onChange={setEndDate} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={styles.label}>Search everything</label>
              <div style={styles.searchBox}>
                <input
                  style={styles.searchInput}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Warehouse, supplier, reference, product"
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  style={styles.dangerPill}
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
            {error && <p style={{ color: "#FF8B99", fontSize: 14 }}>{error}</p>}
            <div style={styles.listShell}>
              {loading && purchases.length === 0 ? (
                <div style={styles.centered}>Loading purchases...</div>
              ) : filteredPurchases.length === 0 ? (
                <div style={styles.centered}>No purchases match the current filters.</div>
              ) : (
                <div style={styles.listScroll}>
                  {filteredPurchases.map((p) => {
                    const warehouseName = p.warehouse?.name || warehouseMap.get(p.warehouse_id ?? "") || p.warehouse_id || "Warehouse";
                    const supplierName = p.supplier?.name || "Supplier";
                    const expanded = expandedId === p.id;
                    return (
                      <article key={p.id} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <div style={{ flex: 1 }}>
                            <p style={styles.cardTitle}>{warehouseName}</p>
                            <p style={styles.cardSub}>{formatTimestamp(p.recorded_at)}</p>
                            {p.reference_code ? <p style={styles.cardSub}>Ref: {p.reference_code}</p> : null}
                            <p style={styles.cardSub}>Supplier: {supplierName}</p>
                          </div>
                          <span
                            style={{
                              ...styles.statusChip,
                              backgroundColor: "#22c55e33",
                              borderColor: "#22c55e",
                            }}
                          >
                            Received
                          </span>
                          <button
                            style={styles.iconBtn}
                            onClick={() => toggleExpand(p.id)}
                            aria-label="Toggle expand"
                          >
                            {expanded ? "^" : "v"}
                          </button>
                        </div>

                        <p style={styles.cardNote}>{p.note || "No note"}</p>

                        <div style={styles.itemsList}>
                          {(expanded ? p.items : p.items.slice(0, 3)).map((item) => {
                            const lineTotal = item.unit_cost != null ? item.unit_cost * item.qty : null;
                            return (
                              <div key={item.id} style={styles.itemRow}>
                                <div>
                                  <p style={styles.itemTitle}>{item.item?.name ?? "Item"}</p>
                                  {item.variant?.name ? <p style={styles.itemSub}>{item.variant.name}</p> : null}
                                  <p style={styles.itemSub}>Qty: {item.qty}</p>
                                  {item.unit_cost != null ? <p style={styles.itemSub}>Unit cost: {currency(item.unit_cost)}</p> : null}
                                  {lineTotal != null ? <p style={styles.itemSub}>Line total: {currency(lineTotal)}</p> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {p.items.length > 3 && (
                          <button style={styles.expandBtn} onClick={() => toggleExpand(p.id)}>
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={styles.label}>{label}</label>
      <select
        style={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={lockSelection}
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={styles.label}>{label}</label>
      <input style={styles.dateInput} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 20% 20%, #182647, #060b16 70%)",
    display: "flex",
    justifyContent: "center",
    padding: "40px 24px",
    color: "#f4f6ff",
    fontFamily: '"Space Grotesk", "Segoe UI", system-ui, sans-serif',
  },
  shell: {
    width: "100%",
    maxWidth: 1280,
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  primaryBtn: {
    background: "#22c55e",
    border: "1px solid #22c55e",
    color: "#0b1020",
    borderRadius: 14,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  linkBtn: {
    background: "transparent",
    border: "1px solid #ffffff33",
    color: "#e5edff",
    borderRadius: 14,
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  iconBtn: {
    background: "#0f172a",
    border: "1px solid #1f2a44",
    color: "#e5edff",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
  iconBtnSpin: {
    animation: "spin 1s linear infinite",
  },
  h1: {
    margin: 0,
    fontSize: 32,
    letterSpacing: -0.5,
  },
  subtle: {
    margin: 0,
    color: "#c6d2ff",
    fontSize: 14,
  },
  panel: {
    background: "rgba(6,11,22,0.75)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
  },
  label: {
    fontSize: 13,
    color: "#c7d2fe",
    letterSpacing: 0.4,
  },
  select: {
    background: "#0f172a",
    border: "1px solid #1f2a44",
    color: "#e5edff",
    borderRadius: 12,
    padding: "12px 12px",
    minHeight: 44,
  },
  dateInput: {
    background: "#0f172a",
    border: "1px solid #1f2a44",
    color: "#e5edff",
    borderRadius: 12,
    padding: "12px 12px",
    minHeight: 44,
    fontSize: 16,
    fontWeight: 700,
    colorScheme: "dark",
  },
  searchBox: {
    background: "#0f172a",
    border: "1px solid #1f2a44",
    borderRadius: 12,
    padding: "10px 12px",
  },
  searchInput: {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#e5edff",
    fontSize: 16,
    outline: "none",
  },
  dangerPill: {
    background: "#1f2937",
    border: "1px solid #22c55e",
    color: "#22c55e",
    borderRadius: 999,
    padding: "10px 16px",
    cursor: "pointer",
  },
  listShell: {
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 18,
    background: "rgba(15,23,42,0.75)",
    minHeight: 180,
  },
  listScroll: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 16,
    maxHeight: "70vh",
    overflow: "auto",
  },
  centered: {
    padding: 24,
    textAlign: "center",
    color: "#cbd5f5",
  },
  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(135deg, rgba(27,31,46,0.9), rgba(20,24,39,0.9))",
  },
  cardHeader: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  cardSub: {
    margin: "4px 0",
    color: "#cbd5f5",
    fontSize: 13,
  },
  statusChip: {
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid #22c55e",
    color: "#22c55e",
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  cardNote: {
    margin: "8px 0 12px",
    color: "#cbd5f5",
    fontSize: 14,
  },
  itemsList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(15,23,42,0.6)",
  },
  itemTitle: {
    margin: 0,
    fontWeight: 600,
  },
  itemSub: {
    margin: "4px 0 0",
    color: "#cbd5f5",
    fontSize: 13,
  },
  qtyBadge: {
    background: "#22c55e",
    color: "#0b1020",
    borderRadius: 12,
    padding: "8px 10px",
    fontWeight: 800,
  },
  expandBtn: {
    marginTop: 10,
    background: "transparent",
    border: "1px solid #ffffff33",
    color: "#e5edff",
    borderRadius: 12,
    padding: "8px 12px",
    cursor: "pointer",
  },
  progressBarWrap: {
    width: "100%",
    height: 4,
    background: "#0f172a",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBar: {
    width: "40%",
    height: "100%",
    background: "linear-gradient(90deg, #22c55e, #4ade80)",
    animation: "loading 1s linear infinite",
  },
};

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-1px);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes loading {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
`;
