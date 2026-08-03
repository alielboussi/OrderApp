"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WAREHOUSE_AUDIT_ACTION_OPTIONS,
  formatAuditDetails,
} from "@/lib/warehouse-audit";
import { useWarehouseAuth } from "../useWarehouseAuth";
import eb from "../enterprise.module.css";
import styles from "./logs.module.css";

type LogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  action: string | null;
  page: string | null;
  method: string | null;
  status: number | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
};


export default function WarehouseBackofficeLogsPage() {
  const router = useRouter();
  const { status, canViewLogs } = useWarehouseAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);

  const [query, setQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [pageQuery, setPageQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (status !== "ok" || !canViewLogs) return;
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        if (userQuery.trim()) params.set("user_email", userQuery.trim());
        if (actionQuery.trim()) params.set("action", actionQuery.trim());
        if (pageQuery.trim()) params.set("page", pageQuery.trim());
        if (startDate) params.set("start_date", startDate);
        if (endDate) params.set("end_date", endDate);

        const res = await fetch(`/api/warehouse-backoffice-logs?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as { rows?: LogRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Failed to load logs");
        if (!active) return;
        setRows(json.rows ?? []);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load logs";
        if (message.includes("warehouse_backoffice_logs") && message.includes("does not exist")) {
          setError(
            "The warehouse_backoffice_logs table is missing. Run supabase/scripts/warehouse_backoffice_audit_logs.sql in the Supabase SQL Editor, then refresh.",
          );
          return;
        }
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [status, canViewLogs, query, userQuery, actionQuery, pageQuery, startDate, endDate]);

  if (status !== "ok") return null;
  if (!canViewLogs) {
    return (
      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Access denied</h3>
        <p className={eb.pageCardBody}>Audit logs are restricted to authorized viewer accounts.</p>
        <button type="button" className={eb.btnSecondary} onClick={() => router.push("/Warehouse_Backoffice")}>
          Back to dashboard
        </button>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            User Activity
          </h3>
          <p className={eb.pageCardBody} style={{ marginTop: 8 }}>
            Read-only log of catalog and middleware actions from warehouse_backoffice_logs.
          </p>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
        {loading ? <div className={styles.loading}>Loading logs…</div> : null}

        <section className={styles.filters}>
          <label className={styles.field}>
            <span className={styles.label}>Search</span>
            <input
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="User, action, page, product, variant…"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>User email</span>
            <input className={styles.input} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Action</span>
            <select className={styles.input} value={actionQuery} onChange={(e) => setActionQuery(e.target.value)}>
              <option value="">All actions</option>
              {WAREHOUSE_AUDIT_ACTION_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Page</span>
            <input
              className={styles.input}
              value={pageQuery}
              onChange={(e) => setPageQuery(e.target.value)}
              placeholder="/Warehouse_Backoffice/catalog/…"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>From date</span>
            <input className={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>To date</span>
            <input className={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </section>

        <section className={styles.table}>
          <div className={`${styles.row} ${styles.head}`}>
            <span>Time</span>
            <span>User</span>
            <span>Action</span>
            <span>Entity</span>
            <span>Page</span>
            <span>Details</span>
          </div>

          {rows.length === 0 && !loading ? (
            <p className={styles.empty}>No audit entries match your filters.</p>
          ) : null}

          {rows.map((row) => (
            <div key={row.id} className={styles.row}>
              <span className={styles.muted}>{new Date(row.created_at).toLocaleString()}</span>
              <span>{row.user_email || row.user_id || "—"}</span>
              <span className={styles.badge}>{row.action || "—"}</span>
              <span>{row.entity_name || row.entity_id || "—"}</span>
              <span className={styles.muted}>{row.page || "—"}</span>
              <span className={styles.details}>{formatAuditDetails(row.details)}</span>
            </div>
          ))}
        </section>
      </section>
    </div>
  );
}
