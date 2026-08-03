"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWarehouseAuth } from "../useWarehouseAuth";
import eb from "../enterprise.module.css";

type Outlet = { id: string; name: string };
type Cashier = {
  id: string;
  outlet_id: string;
  name: string;
  username: string;
  user_type: string;
  pos_user_id: number | null;
  sync_status: string;
  active: boolean;
  last_synced_at: string | null;
};

const syncStatusLabel: Record<string, string> = {
  pending_insert: "Pending insert",
  synced: "Synced",
  pending_delete: "Pending delete",
  deleted: "Deleted",
};

export default function AllCashiersPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadOutlets = useCallback(async () => {
    const res = await fetch("/api/outlets?scope=middleware");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unable to load outlets");
    const rows = Array.isArray(json.outlets) ? json.outlets : [];
    setOutlets(rows.map((row: Outlet) => ({ id: row.id, name: row.name })));
  }, []);

  const loadCashiers = useCallback(async (selectedOutletId: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const query = selectedOutletId ? `?outlet_id=${encodeURIComponent(selectedOutletId)}` : "";
      const res = await fetch(`/api/cashiers${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load cashiers");
      setCashiers(Array.isArray(json.cashiers) ? json.cashiers : []);
      if (json.warning) setMessage(json.warning);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
      setCashiers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") void loadOutlets();
  }, [status, loadOutlets]);

  useEffect(() => {
    if (status === "ok") void loadCashiers(outletId);
  }, [status, outletId, loadCashiers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cashiers;
    return cashiers.filter(
      (cashier) =>
        cashier.name.toLowerCase().includes(q) ||
        cashier.username.toLowerCase().includes(q) ||
        String(cashier.pos_user_id ?? "").includes(q),
    );
  }, [cashiers, search]);

  const pullCashiers = async () => {
    if (!outletId) {
      setMessage("Select an outlet before pulling cashiers.");
      return;
    }
    setPulling(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cashiers/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: outletId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Pull failed");
      setMessage(json.message || "Pull queued. Refresh in a few seconds after middleware syncs.");
      window.setTimeout(() => void loadCashiers(outletId), 4000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h3 className={eb.pageCardTitle}>All Cashiers</h3>
            <p className={eb.pageCardBody}>
              Portal is the source of truth for adding and deleting cashiers. Use Pull Cashiers to import existing
              MintPOS cashiers for an outlet.
            </p>
          </div>
          {!readOnly && (
            <Link href="/Warehouse_Backoffice/cashiers/add" className={eb.btnPrimary}>
              Add Cashier
            </Link>
          )}
        </div>
      </section>

      <section className={eb.pageCard} style={{ display: "grid", gap: 12 }}>
        <div className={eb.filterBar}>
          <label className={eb.fieldLabel}>
            Outlet
            <select className={eb.fieldSelect} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              <option value="">All middleware outlets</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>
          <label className={eb.fieldLabel}>
            Search
            <input
              className={eb.fieldInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, username, or MintPOS id"
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={eb.btnSecondary}
            disabled={readOnly || pulling || !outletId}
            onClick={() => void pullCashiers()}
          >
            {pulling ? "Pulling…" : "Pull Cashiers"}
          </button>
          <button type="button" className={eb.btnSecondary} disabled={loading} onClick={() => void loadCashiers(outletId)}>
            Refresh
          </button>
        </div>

        {message && <div className={`${eb.alertBanner} ${eb.alertGold}`}>{message}</div>}
      </section>

      <section className={eb.pageCard}>
        {loading ? (
          <p className={eb.pageCardBody}>Loading cashiers…</p>
        ) : filtered.length === 0 ? (
          <p className={eb.pageCardBody}>No cashiers found.</p>
        ) : (
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>MintPOS Id</th>
                  <th>User Type</th>
                  <th>Sync Status</th>
                  <th>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cashier) => (
                  <tr key={cashier.id}>
                    <td>{cashier.name}</td>
                    <td>{cashier.username}</td>
                    <td>{cashier.pos_user_id ?? "—"}</td>
                    <td>{cashier.user_type}</td>
                    <td>{syncStatusLabel[cashier.sync_status] ?? cashier.sync_status}</td>
                    <td>{cashier.last_synced_at ? new Date(cashier.last_synced_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
