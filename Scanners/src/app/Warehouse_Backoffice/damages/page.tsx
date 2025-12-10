"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
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
              ?.map((i) => `${i.item?.name ?? ""} ${i.variant?.name ?? ""} ${i.item_id ?? ""} ${i.variant_id ?? ""}`)
              .join(" ") ?? "",
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
            title="Refresh damages"
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
          <h1 style={styles.h1}>Warehouse Damages</h1>
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
                  placeholder="Warehouse, product, note"
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
              {loading && damages.length === 0 ? (
                <div style={styles.centered}>Loading damages...</div>
              ) : filteredDamages.length === 0 ? (
                <div style={styles.centered}>No damages match the current filters.</div>
              ) : (
                <div style={styles.listScroll}>
                  {filteredDamages.map((d) => {
                    const warehouseName = d.warehouse?.name || warehouseMap.get(d.warehouse_id ?? "") || d.warehouse_id || "Unknown warehouse";
                    const expanded = expandedId === d.id;
                    return (
                      <article key={d.id} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <div style={{ flex: 1 }}>
                            <p style={styles.cardTitle}>{warehouseName}</p>
                            <p style={styles.cardSub}>{formatTimestamp(d.created_at)}</p>
                            <p style={styles.cardSub}>Ref: {d.id.slice(0, 8)}</p>
                          </div>
                          <span
                            style={{
                              ...styles.statusChip,
                              backgroundColor: "#f9731633",
                              borderColor: "#f97316",
                            }}
                          >
                            {titleCase("logged")}
                          </span>
                          <button
                            style={styles.iconBtn}
                            onClick={() => toggleExpand(d.id)}
                            aria-label="Toggle expand"
                          >
                            {expanded ? "^" : "v"}
                          </button>
                        </div>

                        <p style={styles.cardNote}>{d.note || "No note"}</p>

                        <div style={styles.itemsList}>
                          {(expanded ? d.items : d.items.slice(0, 3)).map((item) => (
                            <div key={item.id} style={styles.itemRow}>
                              <div>
                                <p style={styles.itemTitle}>{item.item?.name ?? "Item"}</p>
                                {item.variant?.name ? <p style={styles.itemSub}>{item.variant.name}</p> : null}
                                {item.note ? <p style={styles.itemSub}>Note: {item.note}</p> : null}
                              </div>
                              <div style={styles.qtyBadge}>- {item.qty}</div>
                            </div>
                          ))}
                        </div>

                        {d.items.length > 3 && (
                          <button style={styles.expandBtn} onClick={() => toggleExpand(d.id)}>
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
      <input style={styles.select} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
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
    background: "#f97316",
    border: "1px solid #f97316",
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
    border: "1px solid #f97316",
    color: "#f97316",
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
    border: "1px solid #f97316",
    color: "#f97316",
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
    background: "#f97316",
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
    background: "linear-gradient(90deg, #f97316, #fb923c)",
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
