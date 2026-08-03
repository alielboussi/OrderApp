"use client";



import Link from "next/link";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { useWarehouseAuth } from "../useWarehouseAuth";

import { getWarehouseAccessToken } from "@/lib/warehouse-auth-client";

import eb from "../enterprise.module.css";



type OutletLoginRow = {

  outlet_id: string;

  outlet_name: string;

  email: string | null;

  password: string | null;

  uses_orders_app: boolean;

};



type EditField = "email" | "password";



function EyeIcon({ open }: { open: boolean }) {

  if (open) {

    return (

      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">

        <path

          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"

          stroke="currentColor"

          strokeWidth="2"

        />

        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />

      </svg>

    );

  }



  return (

    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">

      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      <path

        d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M6.7 6.7C4.6 8.1 3 10.2 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.8-1.1M17.3 17.3C19.4 15.9 21 13.8 22 12s-3.5-7-10-7c-1.8 0-3.4.4-4.8 1.1"

        stroke="currentColor"

        strokeWidth="2"

        strokeLinecap="round"

      />

    </svg>

  );

}



function PenIcon() {

  return (

    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">

      <path

        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"

        stroke="currentColor"

        strokeWidth="2"

        strokeLinecap="round"

        strokeLinejoin="round"

      />

    </svg>

  );

}



const cellActions: CSSProperties = {

  display: "inline-flex",

  alignItems: "center",

  gap: 8,

};



const iconButton: CSSProperties = {

  display: "inline-flex",

  alignItems: "center",

  justifyContent: "center",

  width: 28,

  height: 28,

  border: "1px solid #cbd5e1",

  borderRadius: 6,

  background: "#fff",

  color: "#334155",

  cursor: "pointer",

};



export default function OutletsPage() {

  const { status } = useWarehouseAuth();

  const [rows, setRows] = useState<OutletLoginRow[]>([]);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [search, setSearch] = useState("");

  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const [editing, setEditing] = useState<{ outletId: string; field: EditField } | null>(null);

  const [editValue, setEditValue] = useState("");

  const [saving, setSaving] = useState(false);



  const loadOutlets = useCallback(async () => {

    setLoading(true);

    setMessage(null);

    try {

      const token = await getWarehouseAccessToken();

      if (!token) throw new Error("Not signed in");



      const res = await fetch("/api/outlets/orders-logins", {

        headers: { Authorization: `Bearer ${token}` },

        cache: "no-store",

      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Unable to load outlets");

      setRows(Array.isArray(json.outlets) ? json.outlets : []);

    } catch (error) {

      setMessage({ ok: false, text: error instanceof Error ? error.message : "Load failed" });

      setRows([]);

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    if (status === "ok") void loadOutlets();

  }, [status, loadOutlets]);



  const filtered = useMemo(() => {

    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter(

      (row) =>

        row.outlet_name.toLowerCase().includes(q) ||

        (row.email ?? "").toLowerCase().includes(q),

    );

  }, [rows, search]);



  const startEdit = (row: OutletLoginRow, field: EditField) => {

    setEditing({ outletId: row.outlet_id, field });

    setEditValue(field === "email" ? row.email ?? "" : row.password ?? "");

    setMessage(null);

  };



  const cancelEdit = () => {

    setEditing(null);

    setEditValue("");

  };



  const saveEdit = async () => {

    if (!editing) return;

    setSaving(true);

    setMessage(null);

    try {

      const token = await getWarehouseAccessToken();

      if (!token) throw new Error("Not signed in");



      const body =

        editing.field === "email"

          ? { outlet_id: editing.outletId, email: editValue.trim() }

          : { outlet_id: editing.outletId, password: editValue };



      const res = await fetch("/api/outlets/orders-logins", {

        method: "PATCH",

        headers: {

          Authorization: `Bearer ${token}`,

          "Content-Type": "application/json",

        },

        body: JSON.stringify(body),

      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Unable to update credentials");



      const updated = json.outlet as OutletLoginRow;

      setRows((current) =>

        current.map((row) => (row.outlet_id === updated.outlet_id ? updated : row)),

      );

      setMessage({

        ok: true,

        text: `${editing.field === "email" ? "Outlet email" : "Outlet password"} updated.`,

      });

      cancelEdit();

    } catch (error) {

      setMessage({ ok: false, text: error instanceof Error ? error.message : "Update failed" });

    } finally {

      setSaving(false);

    }

  };



  const togglePassword = (outletId: string) => {

    setVisiblePasswords((current) => ({ ...current, [outletId]: !current[outletId] }));

  };



  if (status !== "ok") return null;



  return (

    <div style={{ display: "grid", gap: 16 }}>

      <section className={eb.pageCard}>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>

          <div>

            <h3 className={eb.pageCardTitle}>Outlets</h3>

            <p className={eb.pageCardBody}>

              Orders app login for each outlet. Supervisors are managed separately and can access all outlets.

            </p>

          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

            <Link href="/Warehouse_Backoffice/outlets/supervisors" className={eb.btnSecondary}>

              Manage supervisors

            </Link>

            <Link href="/Warehouse_Backoffice/outlets/create" className={eb.btnPrimary}>

              Create Outlet

            </Link>

          </div>

        </div>

      </section>



      <section className={eb.pageCard} style={{ display: "grid", gap: 12 }}>

        <div className={eb.filterBar}>

          <label className={eb.fieldLabel}>

            Search

            <input

              className={eb.fieldInput}

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              placeholder="Outlet name or email"

            />

          </label>

        </div>



        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>

          <button type="button" className={eb.btnSecondary} disabled={loading} onClick={() => void loadOutlets()}>

            {loading ? "Refreshing…" : "Refresh"}

          </button>

        </div>



        {message ? (

          <div className={`${eb.alertBanner} ${message.ok ? eb.alertGreen : eb.alertGold}`}>

            {message.text}

          </div>

        ) : null}

      </section>



      <section className={eb.pageCard}>

        {loading ? (

          <p className={eb.pageCardBody}>Loading outlets…</p>

        ) : filtered.length === 0 ? (

          <p className={eb.pageCardBody}>No outlets found.</p>

        ) : (

          <div className={eb.tableWrap}>

            <table className={eb.dataTable}>

              <thead>

                <tr>

                  <th>Outlet</th>

                  <th>Orders app email</th>

                  <th>Password</th>

                  <th>Catalog access</th>

                </tr>

              </thead>

              <tbody>

                {filtered.map((row) => {

                  const editingEmail = editing?.outletId === row.outlet_id && editing.field === "email";

                  const editingPassword = editing?.outletId === row.outlet_id && editing.field === "password";

                  const passwordVisible = visiblePasswords[row.outlet_id] === true;



                  const renderCredentialCell = (

                    field: EditField,

                    value: string | null,

                    isEditing: boolean,

                    isPassword = false,

                    visible = false,

                  ) =>

                    isEditing ? (

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

                        <input

                          className={eb.fieldInput}

                          type={field === "email" ? "email" : "text"}

                          value={editValue}

                          onChange={(e) => setEditValue(e.target.value)}

                          autoFocus

                        />

                        <button

                          type="button"

                          className={eb.btnSecondary}

                          disabled={saving}

                          onClick={() => void saveEdit()}

                        >

                          Save

                        </button>

                        <button type="button" className={eb.btnSecondary} disabled={saving} onClick={cancelEdit}>

                          Cancel

                        </button>

                      </div>

                    ) : (

                      <span style={cellActions}>

                        <span>

                          {value ? (isPassword ? (visible ? value : "••••••••") : value) : "Not set"}

                        </span>

                        {isPassword && value ? (

                          <button

                            type="button"

                            style={iconButton}

                            aria-label={visible ? "Hide password" : "Show password"}

                            title={visible ? "Hide password" : "Show password"}

                            onClick={() => togglePassword(row.outlet_id)}

                          >

                            <EyeIcon open={visible} />

                          </button>

                        ) : null}

                        <button

                          type="button"

                          style={iconButton}

                          aria-label={`Edit ${field} for ${row.outlet_name}`}

                          title={`Edit ${field}`}

                          onClick={() => startEdit(row, field)}

                        >

                          <PenIcon />

                        </button>

                      </span>

                    );



                  return (

                    <tr key={row.outlet_id}>

                      <td>{row.outlet_name}</td>

                      <td>{renderCredentialCell("email", row.email, editingEmail)}</td>

                      <td>{renderCredentialCell("password", row.password, editingPassword, true, passwordVisible)}</td>

                      <td>

                        <Link

                          href={`/Warehouse_Backoffice/outlets/catalog-access?outlet_id=${encodeURIComponent(row.outlet_id)}`}

                        >

                          Assign catalog

                        </Link>

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

        )}

      </section>

    </div>

  );

}

