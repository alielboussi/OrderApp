"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
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

function toIsoDate(value: string, endOfDay: boolean) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
  return date.toISOString();
}

export default function WarehouseBackofficeLogsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
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

        let queryBuilder = supabase
          .from("warehouse_backoffice_logs")
          .select(
            "id,created_at,user_id,user_email,action,page,method,status,entity_type,entity_id,entity_name,details",
          )
          .order("created_at", { ascending: false })
          .limit(500);

        const searchTerm = query.trim();
        if (searchTerm) {
          const encoded = `%${searchTerm}%`;
          queryBuilder = queryBuilder.or(
            `user_email.ilike.${encoded},action.ilike.${encoded},page.ilike.${encoded},entity_name.ilike.${encoded},entity_id.ilike.${encoded}`,
          );
        }

        if (userQuery.trim()) queryBuilder = queryBuilder.ilike("user_email", `%${userQuery.trim()}%`);
        if (actionQuery.trim()) queryBuilder = queryBuilder.eq("action", actionQuery.trim());
        if (pageQuery.trim()) queryBuilder = queryBuilder.ilike("page", `%${pageQuery.trim()}%`);

        const startIso = toIsoDate(startDate, false);
        const endIso = toIsoDate(endDate, true);
        if (startIso) queryBuilder = queryBuilder.gte("created_at", startIso);
        if (endIso) queryBuilder = queryBuilder.lte("created_at", endIso);

        const { data, error: fetchError } = await queryBuilder;
        if (fetchError) throw fetchError;
        if (!active) return;
        setRows((data as LogRow[]) ?? []);
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
  }, [status, canViewLogs, query, userQuery, actionQuery, pageQuery, startDate, endDate, supabase]);

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
