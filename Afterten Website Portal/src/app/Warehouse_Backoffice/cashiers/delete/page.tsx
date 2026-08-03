"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";

type Outlet = { id: string; name: string };
type Cashier = {
  id: string;
  outlet_id: string;
  name: string;
  username: string;
  pos_user_id: number | null;
  sync_status: string;
};

export default function DeleteCashierPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadOutlets = useCallback(async () => {
    const res = await fetch("/api/outlets?scope=middleware");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unable to load outlets");
    const rows = Array.isArray(json.outlets) ? json.outlets : [];
    setOutlets(rows.map((row: Outlet) => ({ id: row.id, name: row.name })));
  }, []);

  const loadCashiers = useCallback(async (selectedOutletId: string) => {
    if (!selectedOutletId) {
      setCashiers([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/cashiers?outlet_id=${encodeURIComponent(selectedOutletId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load cashiers");
      const rows = (Array.isArray(json.cashiers) ? json.cashiers : []).filter(
        (cashier: Cashier) => cashier.sync_status !== "deleted" && cashier.sync_status !== "pending_delete",
      );
      setCashiers(rows);
      setSelectedId("");
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Load failed" });
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

  const selectedCashier = useMemo(
    () => cashiers.find((cashier) => cashier.id === selectedId) ?? null,
    [cashiers, selectedId],
  );

  const deleteCashier = async () => {
    if (!selectedCashier || readOnly) return;
    const confirmed = window.confirm(
      `Delete cashier "${selectedCashier.name}" (${selectedCashier.username}) from MintPOS? Middleware will delete Rights rows first.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/cashiers/${encodeURIComponent(selectedCashier.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setMessage({ ok: true, text: json.message || "Delete queued." });
      await loadCashiers(outletId);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Delete failed" });
    } finally {
      setDeleting(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h3 className={eb.pageCardTitle}>Delete Cashier</h3>
            <p className={eb.pageCardBody}>
              Queues middleware to run <code>DELETE FROM Rights WHERE Userid = …</code> before removing the MintPOS user.
            </p>
          </div>
          <Link href="/Warehouse_Backoffice/cashiers" className={eb.btnSecondary}>
            All Cashiers
          </Link>
        </div>
      </section>

      <section className={eb.pageCard} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <div className={eb.fieldGrid}>
          <label className={eb.fieldLabel}>
            Outlet
            <select
              className={eb.fieldSelect}
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              disabled={readOnly}
            >
              <option value="">Select outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>
          <label className={eb.fieldLabel}>
            Cashier
            <select
              className={eb.fieldSelect}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={readOnly || loading || cashiers.length === 0}
            >
              <option value="">{loading ? "Loading…" : "Select cashier"}</option>
              {cashiers.map((cashier) => (
                <option key={cashier.id} value={cashier.id}>
                  {cashier.name} ({cashier.username}) — MintPOS #{cashier.pos_user_id ?? "pending"}
                </option>
              ))}
            </select>
          </label>
        </div>

        {message && (
          <div className={`${eb.alertBanner} ${message.ok ? eb.alertGreen : eb.alertRed}`}>{message.text}</div>
        )}

        <div>
          <button
            type="button"
            className={eb.btnDeduct}
            disabled={readOnly || deleting || !selectedCashier || !selectedCashier.pos_user_id}
            onClick={() => void deleteCashier()}
          >
            {deleting ? "Deleting…" : "Delete Cashier"}
          </button>
        </div>
      </section>
    </div>
  );
}
