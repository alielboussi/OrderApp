"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";

type Outlet = { id: string; name: string };

export default function AddCashierPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadOutlets = useCallback(async () => {
    const res = await fetch("/api/outlets?scope=middleware");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unable to load outlets");
    const rows = Array.isArray(json.outlets) ? json.outlets : [];
    setOutlets(rows.map((row: Outlet) => ({ id: row.id, name: row.name })));
  }, []);

  useEffect(() => {
    if (status === "ok") void loadOutlets();
  }, [status, loadOutlets]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;

    if (!password.trim()) {
      setMessage({ ok: false, text: "Password is required before sending the cashier to MintPOS." });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ ok: false, text: "Password and confirmation do not match." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cashiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          name,
          username,
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to add cashier");

      setMessage({
        ok: true,
        text: "Cashier queued for MintPOS. Middleware will insert the user with Usertype Cashier on the next sync cycle.",
      });
      setName("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h3 className={eb.pageCardTitle}>Add Cashier</h3>
            <p className={eb.pageCardBody}>
              Creates the cashier in the portal and queues middleware to insert them into MintPOS with Usertype Cashier.
              A password is required.
            </p>
          </div>
          <Link href="/Warehouse_Backoffice/cashiers" className={eb.btnSecondary}>
            All Cashiers
          </Link>
        </div>
      </section>

      <form className={eb.pageCard} onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label className={eb.fieldLabel}>
          Outlet
          <select
            className={eb.fieldSelect}
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            required
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

        <div className={eb.fieldGrid}>
          <label className={eb.fieldLabel}>
            Cashier Name
            <input
              className={eb.fieldInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={readOnly}
            />
          </label>
          <label className={eb.fieldLabel}>
            Username
            <input
              className={eb.fieldInput}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={readOnly}
              autoComplete="off"
            />
          </label>
        </div>

        <div className={eb.fieldGrid}>
          <label className={eb.fieldLabel}>
            Password
            <input
              className={eb.fieldInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={readOnly}
              autoComplete="new-password"
            />
          </label>
          <label className={eb.fieldLabel}>
            Confirm Password
            <input
              className={eb.fieldInput}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={readOnly}
              autoComplete="new-password"
            />
          </label>
        </div>

        {message && (
          <div className={`${eb.alertBanner} ${message.ok ? eb.alertGreen : eb.alertRed}`}>{message.text}</div>
        )}

        <div>
          <button type="submit" className={eb.btnPrimary} disabled={readOnly || saving}>
            {saving ? "Saving…" : "Add Cashier"}
          </button>
        </div>
      </form>
    </div>
  );
}
