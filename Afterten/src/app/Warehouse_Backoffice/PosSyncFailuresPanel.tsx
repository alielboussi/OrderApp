"use client";

import { useEffect, useMemo, useState } from "react";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./enterprise.module.css";

type OutletOption = { id: string; name: string };

type FailureRow = {
  id: string;
  created_at: string;
  outlet_id: string | null;
  outlet_name: string;
  stage: string | null;
  error_message: string | null;
  source_event_id: string | null;
  pos_order_id: string | null;
  sale_id: string | null;
  details: Record<string, unknown> | null;
};

type WhoAmIOutlet = {
  outlet_id: string;
  outlet_name: string;
};

type OutletRow = { id: string; name: string | null };

type RawFailureRow = {
  id: string;
  created_at: string;
  outlet_id: string | null;
  stage: string | null;
  error_message: string | null;
  source_event_id: string | null;
  pos_order_id: string | null;
  sale_id: string | null;
  details: Record<string, unknown> | null;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function toDateInputValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

export default function PosSyncFailuresPanel() {
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status } = useWarehouseAuth();

  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(toDateInputValue(lastWeek));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      try {
        setBooting(true);
        setError(null);

        const mapped: OutletOption[] = [];
        const res = await fetch("/api/outlets?scope=selling", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { outlets?: Array<{ id: string; name?: string | null }> };
          for (const outlet of json.outlets ?? []) {
            if (outlet?.id) {
              mapped.push({ id: outlet.id, name: (outlet.name ?? outlet.id).trim() });
            }
          }
        }

        if (!active) return;

        if (mapped.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as WhoAmIOutlet | undefined;
          if (fallbackOutlet?.outlet_id) {
            mapped.push({ id: fallbackOutlet.outlet_id, name: fallbackOutlet.outlet_name });
          }
        }

        setOutlets(mapped);
        if (mapped.length > 0 && selectedOutletIds.length === 0) {
          setSelectedOutletIds(mapped.map((outlet) => outlet.id));
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setBooting(false);
      }
    };

    loadOutlets();

    return () => {
      active = false;
    };
  }, [status, supabase, selectedOutletIds.length]);

  const toggleOutlet = (id: string) => {
    setSelectedOutletIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const selectAllOutlets = () => {
    setSelectedOutletIds(outlets.map((outlet) => outlet.id));
  };

  const clearOutlets = () => {
    setSelectedOutletIds([]);
  };

  const runReport = async () => {
    if (status !== "ok") return;

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("pos_sync_failures")
        .select("id,created_at,outlet_id,stage,error_message,source_event_id,pos_order_id,sale_id,details")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (selectedOutletIds.length > 0) {
        query = query.in("outlet_id", selectedOutletIds);
      }

      if (startDate) {
        const startIso = new Date(`${startDate}T00:00:00`).toISOString();
        query = query.gte("created_at", startIso);
      }

      if (endDate) {
        const end = new Date(`${endDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        query = query.lt("created_at", end.toISOString());
      }

      const searchTerm = search.trim();
      if (searchTerm) {
        const encoded = `%${searchTerm}%`;
        query = query.or(
          `stage.ilike.${encoded},error_message.ilike.${encoded},pos_order_id.ilike.${encoded},sale_id.ilike.${encoded},source_event_id.ilike.${encoded}`
        );
      }

      const { data: failureData, error: failureError } = await query;
      if (failureError) throw failureError;

      const failures = (failureData ?? []) as RawFailureRow[];
      if (failures.length === 0) {
        setRows([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      const outletIds = Array.from(new Set(failures.map((row) => row.outlet_id).filter(Boolean))) as string[];
      const { data: outletRows, error: outletError } = outletIds.length
        ? await supabase.from("outlets").select("id,name").in("id", outletIds)
        : { data: [] as OutletRow[] };

      if (outletError) throw outletError;

      const outletMap = new Map(
        (outletRows ?? []).map((outlet) => [outlet.id, outlet.name ?? outlet.id])
      );

      const mapped = failures.map((row) => ({
        id: row.id,
        created_at: new Date(row.created_at).toLocaleString(),
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_id ? outletMap.get(row.outlet_id) ?? row.outlet_id : "Unknown",
        stage: row.stage,
        error_message: row.error_message,
        source_event_id: row.source_event_id,
        pos_order_id: row.pos_order_id,
        sale_id: row.sale_id,
        details: row.details,
      }));

      setRows(mapped);
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    const stageSet = new Set<string>();
    const outletSet = new Set<string>();
    rows.forEach((row) => {
      if (row.stage) stageSet.add(row.stage);
      if (row.outlet_id) outletSet.add(row.outlet_id);
    });
    return {
      count: rows.length,
      outlets: outletSet.size,
      stages: stageSet.size,
    };
  }, [rows]);

  const downloadCsv = () => {
    if (!rows.length) return;
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const outletText = selectedOutletIds.length ? `Selected outlets (${selectedOutletIds.length})` : "All outlets";
    const rangeText = startDate && endDate ? `${startDate} to ${endDate}` : "All dates";

    const metaLines = [
      ["Report", "POS Sync Failures"],
      ["Outlets", outletText],
      ["Date range", rangeText],
      ["Total failures", totals.count],
      [""],
    ].map((line) => line.map(csvEscape).join(","));

    const headers = [
      "Time",
      "Outlet",
      "Stage",
      "Error",
      "POS Order",
      "Sale Id",
      "Source Event",
    ];

    const lines = rows.map((row) => [
      row.created_at,
      row.outlet_name,
      row.stage ?? "",
      row.error_message ?? "",
      row.pos_order_id ?? "",
      row.sale_id ?? "",
      row.source_event_id ?? "",
    ].map(csvEscape).join(","));

    const csv = [...metaLines, headers.map(csvEscape).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pos-sync-failures-${startDate || "all"}-to-${endDate || "all"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (status !== "ok" || booting || selectedOutletIds.length === 0) return;
    void runReport();
  }, [status, booting, selectedOutletIds.length, startDate, endDate, search]);

  if (status !== "ok") return null;

  return (
    <div>
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Filters
          </h3>
        </div>

        <div className={styles.fieldGrid}>
          <div className={styles.syncOutletPanel}>
            <div className={styles.syncOutletRowHeader}>
              <strong>Outlets</strong>
              <div className={styles.syncDialogActions} style={{ marginTop: 0 }}>
                <button type="button" className={styles.btnSecondary} onClick={selectAllOutlets}>
                  Select all
                </button>
                <button type="button" className={styles.btnSecondary} onClick={clearOutlets}>
                  Clear
                </button>
              </div>
            </div>
            <div className={styles.dashboardStatsOutletList}>
              {outlets.length === 0 ? (
                <p className={styles.pageCardBody}>No outlets found.</p>
              ) : (
                outlets.map((outlet) => (
                  <label key={outlet.id} className={styles.dashboardStatsOutletRow}>
                    <input
                      type="checkbox"
                      checked={selectedOutletIds.includes(outlet.id)}
                      onChange={() => toggleOutlet(outlet.id)}
                    />
                    <span>{outlet.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className={styles.pageCardBody} style={{ margin: "8px 0 0", fontSize: 12 }}>
              Selected: {selectedOutletIds.length}
            </p>
          </div>

          <label className={styles.fieldLabel}>
            Start date
            <input
              className={styles.fieldInput}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className={styles.fieldLabel}>
            End date
            <input
              className={styles.fieldInput}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <label className={styles.fieldLabel}>
            Stage / error / POS order
            <input
              className={styles.fieldInput}
              placeholder="Search stage, error, order id"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.syncDialogActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={runReport}
            disabled={loading || selectedOutletIds.length === 0}
          >
            {loading ? "Running..." : "Run Report"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={downloadCsv}
            disabled={rows.length === 0}
          >
            Download CSV
          </button>
          {reportAt ? (
            <span className={styles.pageCardBody} style={{ margin: 0, alignSelf: "center" }}>
              Last run: {reportAt}
            </span>
          ) : null}
          <span className={styles.pageCardBody} style={{ margin: 0, alignSelf: "center" }}>
            Results limited to 2,000 failures.
          </span>
        </div>
      </section>

      {error ? (
        <div className={`${styles.alertBanner} ${styles.alertRed}`}>
          <div>
            <strong>Report error</strong>
            <div style={{ marginTop: 6, fontSize: 13 }}>{error}</div>
          </div>
        </div>
      ) : null}

      <section className={styles.pageCard}>
        <div className={styles.summaryGrid}>
          <div className={`${styles.summaryCard} ${styles.summaryCardBlue}`}>
            <p className={styles.summaryLabel}>Failures</p>
            <p className={styles.summaryValue}>{totals.count}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Outlets</p>
            <p className={styles.summaryValue}>{totals.outlets}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Stages</p>
            <p className={styles.summaryValue}>{totals.stages}</p>
          </div>
        </div>
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGreen}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Failure details
          </h3>
        </div>
        <p className={styles.pageCardBody} style={{ margin: "0 0 12px" }}>
          {rows.length} rows matched filters
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Outlet</th>
                <th>Stage</th>
                <th>Error</th>
                <th>POS Order</th>
                <th>Sale Id</th>
                <th>Source Event</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--eb-muted)", padding: "18px 12px" }}>
                    {loading ? "Loading report..." : "No failures match the current filters."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.created_at}</td>
                    <td>{row.outlet_name}</td>
                    <td>{row.stage ?? "-"}</td>
                    <td>{row.error_message ?? "-"}</td>
                    <td>{row.pos_order_id ?? "-"}</td>
                    <td>{row.sale_id ?? "-"}</td>
                    <td>{row.source_event_id ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}