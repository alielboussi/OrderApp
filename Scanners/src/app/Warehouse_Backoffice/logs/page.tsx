"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
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
          .select("id,created_at,user_id,user_email,action,page,method,status,details")
          .order("created_at", { ascending: false })
          .limit(500);

        const searchTerm = query.trim();
        if (searchTerm) {
          const encoded = `%${searchTerm}%`;
          queryBuilder = queryBuilder.or(
            `user_email.ilike.${encoded},action.ilike.${encoded},page.ilike.${encoded}`
          );
        }

        if (userQuery.trim()) queryBuilder = queryBuilder.ilike("user_email", `%${userQuery.trim()}%`);
        if (actionQuery.trim()) queryBuilder = queryBuilder.ilike("action", `%${actionQuery.trim()}%`);
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
        setError(err instanceof Error ? err.message : "Failed to load logs");
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
      <div className={styles.page}>
        <main className={styles.shell}>
          <h1 className={styles.title}>Access denied</h1>
          <p className={styles.subtitle}>This page is restricted to backoffice admins.</p>
          <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>Back</button>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>Warehouse Backoffice Logs</h1>
            <p className={styles.subtitle}>Read-only audit trail for backoffice actions.</p>
          </div>
          <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>Back</button>
        </header>

        {error && <div className={styles.error}>{error}</div>}
        {loading && <div className={styles.loading}>Loading logs…</div>}

        <section className={styles.filters}>
          <label className={styles.field}>
            <span className={styles.label}>Search (user/action/page)</span>
            <input className={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>User email</span>
            <input className={styles.input} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Action</span>
            <input className={styles.input} value={actionQuery} onChange={(e) => setActionQuery(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Page</span>
            <input className={styles.input} value={pageQuery} onChange={(e) => setPageQuery(e.target.value)} />
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
            <span>Page</span>
            <span>Details</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className={styles.row}>
              <span className={styles.muted}>{new Date(row.created_at).toLocaleString()}</span>
              <span>{row.user_email || row.user_id || "-"}</span>
              <span className={styles.badge}>{row.action || "-"}</span>
              <span>{row.page || "-"}</span>
              <span className={styles.muted}>{row.method ? `${row.method} ${row.status ?? ""}`.trim() : "-"}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
