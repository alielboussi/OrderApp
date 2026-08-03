"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";

export default function CreateOutletPage() {
  const { status, readOnly } = useWarehouseAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [ordersAppEmail, setOrdersAppEmail] = useState("");
  const [ordersAppPassword, setOrdersAppPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;

    if (!ordersAppPassword.trim()) {
      setMessage({ ok: false, text: "Orders app password is required." });
      return;
    }
    if (ordersAppPassword !== confirmPassword) {
      setMessage({ ok: false, text: "Password and confirmation do not match." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outlets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: code.trim() || null,
          orders_app_email: ordersAppEmail.trim(),
          orders_app_password: ordersAppPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to create outlet");

      const outletId = json.outlet?.outletId as string | undefined;
      setMessage({
        ok: true,
        text: outletId
          ? `Outlet created. Assign catalog items on the next screen.`
          : "Outlet created.",
      });

      if (outletId) {
        router.push(`/Warehouse_Backoffice/outlets/catalog-access?outlet_id=${encodeURIComponent(outletId)}`);
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Create failed" });
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
            <h3 className={eb.pageCardTitle}>Create Outlet</h3>
            <p className={eb.pageCardBody}>
              Creates a Firestore outlet, Firebase Auth login for the Orders app, and links{" "}
              <code>app_users</code>. Next step: assign products on Outlet Catalog Access.
            </p>
          </div>
          <Link href="/Warehouse_Backoffice/outlets/catalog-access" className={eb.btnSecondary}>
            Catalog Access
          </Link>
        </div>
      </section>

      <form className={eb.pageCard} onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label className={eb.fieldLabel}>
          Outlet name
          <input
            className={eb.fieldInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. OneWay"
            required
            disabled={readOnly}
          />
        </label>

        <label className={eb.fieldLabel}>
          Outlet code (optional)
          <input
            className={eb.fieldInput}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ONEWAY"
            disabled={readOnly}
          />
        </label>

        <label className={eb.fieldLabel}>
          Orders app login email
          <input
            className={eb.fieldInput}
            type="email"
            value={ordersAppEmail}
            onChange={(e) => setOrdersAppEmail(e.target.value)}
            placeholder="outlet@example.com"
            required
            disabled={readOnly}
          />
        </label>

        <div className={eb.fieldGrid}>
          <label className={eb.fieldLabel}>
            Orders app password
            <input
              className={eb.fieldInput}
              type="password"
              value={ordersAppPassword}
              onChange={(e) => setOrdersAppPassword(e.target.value)}
              required
              disabled={readOnly}
            />
          </label>
          <label className={eb.fieldLabel}>
            Confirm password
            <input
              className={eb.fieldInput}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={readOnly}
            />
          </label>
        </div>

        {message ? (
          <p className={eb.pageCardBody} style={{ color: message.ok ? "#166534" : "#b91c1c" }}>
            {message.text}
          </p>
        ) : null}

        <button type="submit" className={eb.btnAdd} disabled={saving || readOnly}>
          {saving ? "Creating…" : "Create outlet & continue to catalog access"}
        </button>
      </form>
    </div>
  );
}
