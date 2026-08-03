"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import { getWarehouseAccessToken } from "@/lib/warehouse-auth-client";
import eb from "../../enterprise.module.css";

type SupervisorRow = {
  id: string;
  name: string;
  email: string;
  password: string | null;
  active: boolean;
};

type EditField = "name" | "email" | "password";

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

export default function OrdersSupervisorsPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [rows, setRows] = useState<SupervisorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSupervisors = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const token = await getWarehouseAccessToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/outlets/orders-supervisors", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load supervisors");
      setRows(Array.isArray(json.supervisors) ? json.supervisors : []);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Load failed" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") void loadSupervisors();
  }, [status, loadSupervisors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const startEdit = (row: SupervisorRow, field: EditField) => {
    setEditing({ id: row.id, field });
    setEditValue(field === "email" ? row.email : field === "name" ? row.name : row.password ?? "");
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
          ? { id: editing.id, email: editValue.trim() }
          : editing.field === "name"
            ? { id: editing.id, name: editValue.trim() }
            : { id: editing.id, password: editValue };

      const res = await fetch("/api/outlets/orders-supervisors", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to update supervisor");

      const updated = json.supervisor as SupervisorRow;
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setMessage({
        ok: true,
        text: `${editing.field === "email" ? "Supervisor email" : editing.field === "name" ? "Supervisor name" : "Supervisor password"} updated.`,
      });
      cancelEdit();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Update failed" });
    } finally {
      setSaving(false);
    }
  };

  const createSupervisor = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const token = await getWarehouseAccessToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/outlets/orders-supervisors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), password: newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to create supervisor");

      const created = json.supervisor as SupervisorRow;
      setRows((current) =>
        [...current, created].sort((a, b) => {
          const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          if (nameCompare !== 0) return nameCompare;
          return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
        }),
      );
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setMessage({ ok: true, text: "Supervisor added." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Create failed" });
    } finally {
      setCreating(false);
    }
  };

  const deleteSupervisor = async (row: SupervisorRow) => {
    if (!window.confirm(`Remove supervisor ${row.email}?`)) return;
    setMessage(null);
    try {
      const token = await getWarehouseAccessToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/outlets/orders-supervisors", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: row.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to delete supervisor");

      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage({ ok: true, text: "Supervisor removed." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Delete failed" });
    }
  };

  const togglePassword = (id: string) => {
    setVisiblePasswords((current) => ({ ...current, [id]: !current[id] }));
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Orders App Supervisors</h3>
        <p className={eb.pageCardBody}>
          Supervisors sign in to the Orders app with their own account and can accept and dispatch orders from all
          outlets.
        </p>
      </section>

      {!readOnly ? (
        <section className={eb.pageCard} style={{ display: "grid", gap: 12 }}>
          <h4 className={eb.pageCardTitle}>Add supervisor</h4>
          <div className={eb.filterBar}>
            <label className={eb.fieldLabel}>
              Name
              <input
                className={eb.fieldInput}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Supervisor full name"
              />
            </label>
            <label className={eb.fieldLabel}>
              Email
              <input
                className={eb.fieldInput}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="supervisor@example.com"
              />
            </label>
            <label className={eb.fieldLabel}>
              Password
              <input
                className={eb.fieldInput}
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </label>
          </div>
          <button
            type="button"
            className={eb.btnPrimary}
            disabled={creating || !newName.trim() || !newEmail.trim() || newPassword.length < 6}
            onClick={() => void createSupervisor()}
          >
            {creating ? "Adding…" : "Add supervisor"}
          </button>
        </section>
      ) : null}

      <section className={eb.pageCard} style={{ display: "grid", gap: 12 }}>
        <div className={eb.filterBar}>
          <label className={eb.fieldLabel}>
            Search
            <input
              className={eb.fieldInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Supervisor name or email"
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className={eb.btnSecondary} disabled={loading} onClick={() => void loadSupervisors()}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {message ? (
          <div className={`${eb.alertBanner} ${message.ok ? eb.alertGreen : eb.alertGold}`}>{message.text}</div>
        ) : null}
      </section>

      <section className={eb.pageCard}>
        {loading ? (
          <p className={eb.pageCardBody}>Loading supervisors…</p>
        ) : filtered.length === 0 ? (
          <p className={eb.pageCardBody}>No supervisors found.</p>
        ) : (
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Password</th>
                  {!readOnly ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const editingName = editing?.id === row.id && editing.field === "name";
                  const editingEmail = editing?.id === row.id && editing.field === "email";
                  const editingPassword = editing?.id === row.id && editing.field === "password";
                  const passwordVisible = visiblePasswords[row.id] === true;

                  const renderCredentialCell = (
                    field: EditField,
                    value: string | null,
                    isEditing: boolean,
                    isPassword = false,
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
                        <span>{value ? (isPassword ? (passwordVisible ? value : "••••••••") : value) : "Not set"}</span>
                        {isPassword && value ? (
                          <button
                            type="button"
                            style={iconButton}
                            aria-label={passwordVisible ? "Hide password" : "Show password"}
                            title={passwordVisible ? "Hide password" : "Show password"}
                            onClick={() => togglePassword(row.id)}
                          >
                            <EyeIcon open={passwordVisible} />
                          </button>
                        ) : null}
                        {!readOnly ? (
                          <button
                            type="button"
                            style={iconButton}
                            aria-label={`Edit ${field} for ${row.email}`}
                            title={`Edit ${field}`}
                            onClick={() => startEdit(row, field)}
                          >
                            <PenIcon />
                          </button>
                        ) : null}
                      </span>
                    );

                  return (
                    <tr key={row.id}>
                      <td>{renderCredentialCell("name", row.name, editingName)}</td>
                      <td>{renderCredentialCell("email", row.email, editingEmail)}</td>
                      <td>{renderCredentialCell("password", row.password, editingPassword, true)}</td>
                      {!readOnly ? (
                        <td>
                          <button
                            type="button"
                            className={eb.btnSecondary}
                            onClick={() => void deleteSupervisor(row)}
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
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
