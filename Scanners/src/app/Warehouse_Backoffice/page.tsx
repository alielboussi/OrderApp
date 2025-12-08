"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Types approximated from the Android WarehousesAdminScreen
interface Warehouse {
  id: string;
  name: string;
}

interface TransferItem {
  id: string;
  product_id?: string | null;
  variation_id?: string | null;
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
  items: TransferItem[];
}

const AUTO_REFRESH_MS = 300_000; // 5 minutes
const MAIN_DASHBOARD_PATH = "/Warehouse_Backoffice";
const BACKOFFICE_URL = (process.env.NEXT_PUBLIC_WAREHOUSE_BACKOFFICE_URL ?? "").trim();

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
  } catch (e) {
    return value;
  }
}

function titleCase(value?: string | null) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeList<T>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  for (const key of keys) {
    const nested = (value as any)?.[key];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

function normalizeErrorMessage(err: any): string {
  if (!err) return "Unknown error";
  const raw = err?.message ?? String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
    if (parsed?.message) return String(parsed.message);
  } catch (e) {
    // ignore JSON parse failure
  }
  return raw;
}

export default function WarehousesAdminWeb() {
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
  const [activeView, setActiveView] = useState<"transfers" | "backoffice">("transfers");
  const [backofficeReloadKey, setBackofficeReloadKey] = useState(0);
  const lockedPathRef = useRef<string | null>(null);
  const allowNavRef = useRef(false);
  const hasActiveFilters = Boolean(
    sourceId || destId || startDate || endDate || searchQuery.trim()
  );
  const backofficeAvailable = BACKOFFICE_URL.length > 0;

  // Lock URL endpoint to prevent navigation elsewhere and force landing on the main dashboard path
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Force-load the main dashboard path even if a different hash/query was used
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

  // Keep the top-of-page “dashboard” buttons visible on load
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
    if (activeView === "backoffice" && !backofficeAvailable) {
      setActiveView("transfers");
    }
  }, [activeView, backofficeAvailable]);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const data = await fetchJson<Warehouse[] | { warehouses?: Warehouse[]; data?: Warehouse[] }>("/api/warehouses");
        const list = normalizeList<Warehouse>(data, ["warehouses", "data"]);
        setWarehouses(list);
      } catch (err: any) {
        setError(normalizeErrorMessage(err) || "Unable to load warehouses");
      }
    };
    loadWarehouses();
  }, []);

  const loadTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sourceId) params.set("sourceId", sourceId);
      if (destId) params.set("destId", destId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const url = `/api/warehouse-transfers?${params.toString()}`;
      const data = await fetchJson<TransferRow[] | { transfers?: TransferRow[]; data?: TransferRow[] }>(url);
      const list = normalizeList<TransferRow>(data, ["transfers", "data"]);
      setTransfers(list);
    } catch (err: any) {
      setError(normalizeErrorMessage(err) || "Unable to load transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceId, destId, startDate, endDate, manualRefreshTick]);

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
            t.items?.map((i) => `${i.product?.name ?? ""} ${i.variation?.name ?? ""} ${i.product_id ?? ""} ${i.variation_id ?? ""}`).join(" ") ?? "",
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

  const handleRefresh = () => {
    if (activeView === "transfers") {
      setManualRefreshTick((v) => v + 1);
    } else if (backofficeAvailable) {
      setBackofficeReloadKey((v) => v + 1);
    }
  };

  const refreshSpinning = activeView === "transfers" && loading;

  return (
    <div style={styles.page}>
      <style>{globalStyles}</style>
      <main style={styles.shell}>
        <header style={styles.header}>
          <button style={styles.primaryBtn} onClick={() => { allowNavRef.current = true; window.history.back(); }}>
            Back
          </button>
          <div style={{ flex: 1 }} />
          <button
            style={{ ...styles.iconBtn, ...(refreshSpinning ? styles.iconBtnSpin : null), ...(activeView === "backoffice" && !backofficeAvailable ? styles.iconBtnDisabled : null) }}
            onClick={handleRefresh}
            title={activeView === "transfers" ? "Refresh transfers" : "Reload backoffice"}
            disabled={activeView === "backoffice" && !backofficeAvailable}
          >
            Refresh
          </button>
          <button
            style={styles.linkBtn}
            onClick={() => { allowNavRef.current = true; window.location.href = "/"; }}
          >
            Log out
          </button>
        </header>

        <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={styles.h1}>Warehouse Command Center</h1>
          <p style={styles.subtle}>Pick a workspace: native transfer console or the hosted backoffice.</p>
        </section>

        <section style={styles.hubPanel}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={styles.hubLead}>Choose a dashboard</p>
            <p style={styles.hubSub}>Switch between the Compose-native transfer manager and the kiosk-style web backoffice.</p>
          </div>
          <div style={styles.hubButtons}>
            <button
              style={activeView === "transfers" ? { ...styles.hubButton, ...styles.hubButtonActive } : styles.hubButton}
              onClick={() => {
                setActiveView("transfers");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Warehouse Transfers
            </button>
            <button
              style={activeView === "backoffice" ? { ...styles.hubButton, ...styles.hubButtonActive } : styles.hubButton}
              onClick={() => backofficeAvailable && setActiveView("backoffice")}
              disabled={!backofficeAvailable}
            >
              Warehouse Backoffice
            </button>
          </div>
          {!backofficeAvailable && (
            <p style={styles.hubWarning}>Set NEXT_PUBLIC_WAREHOUSE_BACKOFFICE_URL to enable the web console.</p>
          )}
        </section>

        {activeView === "transfers" ? (
          <>
            <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <LabeledSelect
                label="From warehouse"
                value={sourceId}
                onChange={setSourceId}
                options={warehouses}
                placeholder="Any warehouse"
              />
              <LabeledSelect
                label="To warehouse"
                value={destId}
                onChange={setDestId}
                options={warehouses}
                placeholder="Any warehouse"
              />
            </div>
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
                  placeholder="Warehouse, product, SKU, note"
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  style={styles.dangerPill}
                  onClick={() => {
                    setSourceId("");
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
            {error && <p style={{ color: "#FF8B99", fontSize: 14 }}>{error}</p>}
            <div style={styles.listShell}>
              {loading && transfers.length === 0 ? (
                <div style={styles.centered}>Loading transfers...</div>
              ) : filteredTransfers.length === 0 ? (
                <div style={styles.centered}>No transfers match the current filters.</div>
              ) : (
                <div style={styles.listScroll}>
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
                      <article key={t.id} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <div style={{ flex: 1 }}>
                            <p style={styles.cardTitle}>
                              {sourceName} <span style={{ color: "#ffffff66" }}>-</span> {destName}
                            </p>
                            <p style={styles.cardSub}>{formatTimestamp(t.created_at)}</p>
                          </div>
                          <span
                            style={{
                              ...styles.statusChip,
                              backgroundColor: isCompleted ? "#FF1B2D33" : "transparent",
                              borderColor: "#FF1B2D",
                            }}
                          >
                            {titleCase(t.status)}
                          </span>
                          <button style={styles.iconBtn} onClick={() => toggleExpand(t.id)} aria-label="Toggle expand">
                            {expanded ? "^" : "v"}
                          </button>
                        </div>
                        {t.note && <p style={styles.cardNote}>Note: {t.note}</p>}
                        {t.completed_at && <p style={styles.cardSub}>Completed {formatTimestamp(t.completed_at)}</p>}
                        {expanded && (
                          <div style={styles.itemsBlock}>
                            {t.items?.map((item) => (
                              <div key={item.id} style={styles.itemRow}>
                                <div>
                                  <p style={styles.itemName}>
                                    {item.product?.name ?? "Unknown product"}
                                    {item.variation?.name ? <span style={styles.itemSub}> - {item.variation.name}</span> : null}
                                  </p>
                                  <p style={styles.itemSub}>{item.product_id ?? item.variation_id ?? "Item"}</p>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <p style={styles.itemQty}>{item.qty}</p>
                                  <p style={styles.itemSub}>{item.variation?.uom ?? item.product?.uom ?? "units"}</p>
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
            <p style={styles.footerText}>Syncs automatically every 5 minutes - Use refresh to pull now</p>
          </div>
        </section>
          </>
        ) : (
          <section style={styles.backofficePanel}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={styles.hubLead}>Warehouse Backoffice</p>
              <p style={styles.hubSub}>Loads the external kiosk console inside the desktop shell. Refresh or pop it into a new tab anytime.</p>
            </div>
            <div style={styles.backofficeActions}>
              <button
                style={styles.backofficeButton}
                onClick={() => backofficeAvailable && setBackofficeReloadKey((v) => v + 1)}
                disabled={!backofficeAvailable}
              >
                Reload console
              </button>
              <button
                style={{ ...styles.backofficeButton, background: "transparent", border: "1px solid rgba(255,255,255,0.4)" }}
                onClick={() => backofficeAvailable && window.open(BACKOFFICE_URL, "_blank", "noopener,noreferrer")}
                disabled={!backofficeAvailable}
              >
                Open in new tab
              </button>
            </div>
            {backofficeAvailable ? (
              <div style={styles.iframeWrap}>
                <iframe
                  key={`backoffice-${backofficeReloadKey}`}
                  src={BACKOFFICE_URL}
                  style={styles.iframe}
                  title="Warehouse Backoffice"
                  allow="clipboard-read; clipboard-write;"
                />
              </div>
            ) : (
              <p style={styles.errorText}>Set NEXT_PUBLIC_WAREHOUSE_BACKOFFICE_URL in your environment to embed the kiosk backoffice here.</p>
            )}
          </section>
        )}
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
}) {
  const { label, value, onChange, options, placeholder } = props;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={styles.label}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        <option value="">{placeholder ?? "Any"}</option>
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
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={styles.label}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      />
    </label>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    minWidth: "320px",
    background: "radial-gradient(circle at top, #111827 0%, #050a1b 60%)",
    color: "#fff",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
  },
  shell: {
    width: "100%",
    maxWidth: "1200px",
    minHeight: "1080px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 18px",
    borderRadius: "24px",
    background: "#131C35",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
  },
  h1: { fontSize: 28, fontWeight: 700, margin: 0 },
  subtle: { color: "#ffffffb3", fontSize: 14, margin: 0 },
  primaryBtn: {
    background: "linear-gradient(100deg, #ff1b2d, #ff445a)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "10px 20px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(255,27,45,0.35)",
  },
  iconBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.3)",
    color: "#fff",
    borderRadius: "999px",
    padding: 10,
    cursor: "pointer",
    minWidth: 40,
  },
  iconBtnSpin: {
    animation: "spin 1s linear infinite",
  },
  iconBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#ffffffcc",
    cursor: "pointer",
    fontWeight: 600,
  },
  progressBarWrap: {
    width: "100%",
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
    background: "rgba(255,255,255,0.08)",
  },
  progressBar: {
    width: "33%",
    height: "100%",
    background: "#FF1B2D",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  panel: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "#131C35",
    boxShadow: "0 25px 70px rgba(0,0,0,0.7)",
    padding: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: "#ffffffb3",
  },
  select: {
    width: "100%",
    borderRadius: 18,
    border: "1.5px solid #ff1b2d",
    padding: "12px 14px",
    background: "#0c152b",
    color: "#fff",
    fontSize: 14,
  },
  searchBox: {
    border: "1.5px solid #ff1b2d",
    borderRadius: 18,
    padding: "10px 14px",
    background: "#0c152b",
  },
  searchInput: {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: 14,
  },
  ghostPill: {
    border: "1px solid rgba(255,27,45,0.6)",
    background: "transparent",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 600,
  },
  dangerPill: {
    border: "1px solid rgba(255,27,45,0.6)",
    background: "rgba(255,27,45,0.15)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 700,
  },
  listShell: {
    minHeight: 480,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "#0c152b",
    padding: 12,
  },
  listScroll: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 520,
    overflowY: "auto",
    paddingRight: 6,
  },
  centered: {
    height: 480,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffffb3",
  },
  card: {
    borderRadius: 20,
    border: "1.5px solid rgba(255,27,45,0.6)",
    background: "#131C35",
    padding: 16,
    boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  cardSub: { margin: 0, fontSize: 13, color: "#ffffff99" },
  statusChip: {
    border: "1px solid #ff1b2d",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#fff",
  },
  cardNote: { marginTop: 8, marginBottom: 0, color: "#ffffffcc", fontSize: 13 },
  itemsBlock: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "rgba(0,0,0,0.2)",
    padding: 10,
    borderRadius: 12,
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  itemName: { margin: 0, fontSize: 14, fontWeight: 600 },
  itemSub: { margin: 0, fontSize: 12, color: "#ffffff80" },
  itemQty: { margin: 0, fontSize: 16, fontWeight: 700 },
  footerText: {
    color: "#ffffff80",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  hubPanel: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "linear-gradient(135deg, #131C35, #0b1123)",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxShadow: "0 30px 80px rgba(0,0,0,0.65)",
  },
  hubLead: {
    margin: 0,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#ffffffb3",
  },
  hubSub: {
    margin: 0,
    fontSize: 14,
    color: "#ffffff99",
  },
  hubButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  hubButton: {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "transparent",
    color: "#fff",
    padding: "14px 20px",
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: "pointer",
    transition: "border-color 0.2s ease, background 0.2s ease",
  },
  hubButtonActive: {
    background: "linear-gradient(100deg, #ff1b2d, #ff445a)",
    borderColor: "transparent",
    boxShadow: "0 8px 24px rgba(255,27,45,0.4)",
  },
  hubWarning: {
    margin: 0,
    fontSize: 13,
    color: "#ff8b99",
  },
  backofficePanel: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c152b",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxShadow: "0 25px 70px rgba(0,0,0,0.7)",
  },
  backofficeActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  backofficeButton: {
    borderRadius: 18,
    border: "none",
    background: "rgba(255,27,45,0.2)",
    color: "#fff",
    padding: "12px 20px",
    fontWeight: 600,
    cursor: "pointer",
  },
  iframeWrap: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#000",
    overflow: "hidden",
    minHeight: 720,
  },
  iframe: {
    width: "100%",
    height: 720,
    border: "none",
    background: "#000",
  },
  errorText: {
    margin: 0,
    color: "#ff8b99",
    fontSize: 14,
  },
};

const globalStyles = `
@keyframes pulse {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(50%); }
  100% { transform: translateX(200%); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #ff1b2d; border-radius: 999px; }
`;
