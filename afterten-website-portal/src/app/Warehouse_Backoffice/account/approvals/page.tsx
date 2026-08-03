"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { warehouseAuthedFetch, type PendingWarehouseAccount } from "@/lib/warehouse-api";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";
import styles from "./approvals.module.css";

function formatStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function displayName(email: string | null | undefined): string {
  if (!email) return "Unknown user";
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export default function WarehouseAccountApprovalsPage() {
  const router = useRouter();
  const { status, canViewLogs } = useWarehouseAuth();

  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<PendingWarehouseAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => accounts.find((account) => account.user_id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await warehouseAuthedFetch("/api/warehouse-account-approvals", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load pending accounts");
      }
      const rows = Array.isArray(payload.accounts) ? (payload.accounts as PendingWarehouseAccount[]) : [];
      setAccounts(rows);
      setSelectedId((current) => {
        if (current && rows.some((row) => row.user_id === current)) return current;
        return rows[0]?.user_id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load pending accounts");
      setAccounts([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "ok" || !canViewLogs) return;
    void loadAccounts();
  }, [status, canViewLogs, loadAccounts]);

  const handleAction = async (action: "approve" | "decline") => {
    if (!selected) return;

    if (action === "decline") {
      const confirmed = window.confirm(
        `Decline ${selected.email ?? "this account"}? This permanently removes the user from authentication.`,
      );
      if (!confirmed) return;
    }

    setActing(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await warehouseAuthedFetch("/api/warehouse-account-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, user_id: selected.user_id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Unable to ${action} account`);
      }

      setSuccess(
        action === "approve"
          ? `${selected.email ?? "Account"} approved. They can sign in now.`
          : `${selected.email ?? "Account"} declined and removed from authentication.`,
      );
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} account`);
    } finally {
      setActing(false);
    }
  };

  if (status !== "ok") return null;

  if (!canViewLogs) {
    return (
      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Access denied</h3>
        <p className={eb.pageCardBody}>Account approvals are restricted to authorized administrator accounts.</p>
        <button type="button" className={eb.btnSecondary} onClick={() => router.push("/Warehouse_Backoffice")}>
          Back to dashboard
        </button>
      </section>
    );
  }

  return (
    <section className={eb.pageCard}>
      <h3 className={eb.pageCardTitle}>Account approvals</h3>
      <p className={eb.pageCardBody}>
        Review new Google and email sign-ups waiting for backoffice access.
      </p>
      <p className={eb.pageCardBody}>
        <button type="button" className={eb.btnSecondary} onClick={() => void loadAccounts()} disabled={loading || acting}>
          Refresh
        </button>
      </p>

      {error ? <p className={`${styles.message} ${styles.messageError}`}>{error}</p> : null}
      {success ? <p className={`${styles.message} ${styles.messageSuccess}`}>{success}</p> : null}

      <div className={styles.layout}>
        <div className={styles.listCard}>
          <div className={styles.listHeader}>
            <h3>Pending ({accounts.length})</h3>
            <p>Click a name to review</p>
          </div>
          <div className={styles.listBody}>
            {loading ? <p className={styles.emptyState}>Loading pending accounts…</p> : null}
            {!loading && accounts.length === 0 ? (
              <p className={styles.emptyState}>No accounts are waiting for approval.</p>
            ) : null}
            {!loading
              ? accounts.map((account) => {
                  const isSelected = account.user_id === selectedId;
                  return (
                    <button
                      key={account.user_id}
                      type="button"
                      className={`${styles.accountButton} ${isSelected ? styles.accountButtonSelected : ""}`}
                      onClick={() => {
                        setSelectedId(account.user_id);
                        setSuccess(null);
                        setError(null);
                      }}
                    >
                      <span className={styles.accountEmail}>{displayName(account.email)}</span>
                      <span className={styles.accountMeta}>{account.email ?? account.user_id}</span>
                      <span className={styles.accountMeta}>Signed up {formatStamp(account.created_at)}</span>
                    </button>
                  );
                })
              : null}
          </div>
        </div>

        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <h3>{selected ? displayName(selected.email) : "Select an account"}</h3>
            <p>{selected ? "Approve or decline this request" : "Choose someone from the pending list"}</p>
          </div>
          <div className={styles.detailBody}>
            {!selected ? <p className={styles.emptyState}>No account selected.</p> : null}
            {selected ? (
              <>
                <div className={styles.metaGrid}>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Email</span>
                    <span className={styles.metaValue}>{selected.email ?? "—"}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>User ID</span>
                    <span className={styles.metaValue}>{selected.user_id}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Signed up</span>
                    <span className={styles.metaValue}>{formatStamp(selected.created_at)}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.approveBtn}
                    onClick={() => void handleAction("approve")}
                    disabled={acting}
                  >
                    {acting ? "Working…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className={styles.declineBtn}
                    onClick={() => void handleAction("decline")}
                    disabled={acting}
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
