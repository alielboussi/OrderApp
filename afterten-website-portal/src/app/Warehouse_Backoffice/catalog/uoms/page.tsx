"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";
import pageStyles from "./uoms.module.css";
import { catalogApiHeaders } from "@/lib/catalog-api-headers";

type UomRecord = {
  code: string;
  label: string;
  active: boolean;
  sort_order: number;
  updated_at?: string;
};

type EditDraft = {
  label: string;
  sort_order: string;
  active: boolean;
};

const emptyForm = {
  code: "",
  label: "",
  sort_order: "0",
  active: true,
};

export default function CatalogUomsPage() {
  const { status, readOnly, userId, userEmail } = useWarehouseAuth();
  const [uoms, setUoms] = useState<UomRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/uoms?admin=true");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load UOMs");
      const nextUoms = Array.isArray(json.uoms) ? json.uoms : [];
      setUoms(nextUoms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load UOMs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") load();
  }, [status, load]);

  const startEdit = (uom: UomRecord) => {
    setEditingCode(uom.code);
    setEditDraft({
      label: uom.label ?? "",
      sort_order: String(uom.sort_order ?? 0),
      active: uom.active !== false,
    });
    setMessage(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditDraft(null);
  };

  const resetCreateForm = () => {
    setForm(emptyForm);
  };

  const createUom = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setError("Read-only access: saving is disabled.");
      return;
    }

    setCreating(true);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        label: form.label.trim(),
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      };

      const res = await fetch("/api/uoms", {
        method: "POST",
        headers: catalogApiHeaders({ userId, userEmail }),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to save UOM");

      setMessage("UOM created.");
      resetCreateForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save UOM");
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async (code: string) => {
    if (readOnly || !editDraft) {
      setError("Read-only access: saving is disabled.");
      return;
    }

    setSavingCode(code);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        code,
        label: editDraft.label.trim(),
        sort_order: Number(editDraft.sort_order) || 0,
        active: editDraft.active,
      };

      const res = await fetch("/api/uoms", {
        method: "PUT",
        headers: catalogApiHeaders({ userId, userEmail }),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to save UOM");

      setMessage(`UOM "${code}" updated.`);
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save UOM");
    } finally {
      setSavingCode(null);
    }
  };

  const remove = async (code: string) => {
    if (readOnly) {
      setError("Read-only access: deleting is disabled.");
      return;
    }

    const confirmed = window.confirm(
      `Delete UOM "${code}"?\n\nProducts already using this code will keep the stored value, but it will no longer appear in UOM dropdowns.`,
    );
    if (!confirmed) return;

    setDeletingCode(code);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/uoms?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: catalogApiHeaders({ userId, userEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to delete UOM");

      setMessage(`UOM "${code}" deleted.`);
      if (editingCode === code) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete UOM");
    } finally {
      setDeletingCode(null);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={pageStyles.pageStack}>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Units of Measure
          </h3>
          <p className={eb.pageCardBody}>
            Manage the UOM list used across products, variants, bulk updates, and the Orders app. Built-in UOMs
            appear here automatically; saving edits stores your changes in the catalog.
          </p>
        </div>
      </section>

      {message ? <p className={pageStyles.message}>{message}</p> : null}
      {error ? <p className={`${pageStyles.message} ${pageStyles.messageError}`}>{error}</p> : null}

      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>New UOM</h3>
        <form onSubmit={createUom} className={pageStyles.uomForm}>
          <label className={`${eb.pageCardBody} ${pageStyles.formField}`}>
            Code
            <input
              className={eb.fieldInput}
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              required
            />
            <small>Example: bottle, kg, case</small>
          </label>
          <label className={`${eb.pageCardBody} ${pageStyles.formField}`}>
            Label
            <input
              className={eb.fieldInput}
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              required
            />
            <small>Shown in dropdowns across the portal.</small>
          </label>
          <label className={`${eb.pageCardBody} ${pageStyles.formField}`}>
            Sort order
            <input
              className={eb.fieldInput}
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            />
          </label>
          <label className={`${eb.pageCardBody} ${pageStyles.formCheckbox}`}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            Active
          </label>
          <div className={pageStyles.formActions}>
            <button type="submit" className={eb.btnAdd} disabled={creating}>
              {creating ? "Saving..." : "Create UOM"}
            </button>
          </div>
        </form>
      </section>

      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>All UOMs</h3>
        {loading ? <p className={eb.pageCardBody}>Loading...</p> : null}
        {!loading && uoms.length === 0 ? <p className={eb.pageCardBody}>No UOMs found yet.</p> : null}
        {!loading && uoms.length > 0 ? (
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Label</th>
                  <th style={{ whiteSpace: "nowrap" }}>Sort</th>
                  <th style={{ whiteSpace: "nowrap" }}>Status</th>
                  <th style={{ whiteSpace: "nowrap", width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uoms.map((uom) => {
                  const isEditing = editingCode === uom.code && editDraft !== null;
                  const rowBusy = savingCode === uom.code || deletingCode === uom.code;

                  return (
                    <tr key={uom.code} className={isEditing ? pageStyles.editingRow : undefined}>
                      <td>{uom.code}</td>
                      <td>
                        {isEditing ? (
                          <input
                            className={`${eb.fieldInput} ${pageStyles.cellInput}`}
                            value={editDraft.label}
                            onChange={(e) =>
                              setEditDraft((prev) => (prev ? { ...prev, label: e.target.value } : prev))
                            }
                            required
                            aria-label={`Label for ${uom.code}`}
                          />
                        ) : (
                          uom.label
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {isEditing ? (
                          <input
                            className={`${eb.fieldInput} ${pageStyles.cellInput} ${pageStyles.cellInputNarrow}`}
                            type="number"
                            value={editDraft.sort_order}
                            onChange={(e) =>
                              setEditDraft((prev) => (prev ? { ...prev, sort_order: e.target.value } : prev))
                            }
                            aria-label={`Sort order for ${uom.code}`}
                          />
                        ) : (
                          uom.sort_order
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {isEditing ? (
                          <label className={pageStyles.cellCheckbox}>
                            <input
                              type="checkbox"
                              checked={editDraft.active}
                              onChange={(e) =>
                                setEditDraft((prev) => (prev ? { ...prev, active: e.target.checked } : prev))
                              }
                            />
                            Active
                          </label>
                        ) : uom.active ? (
                          "Active"
                        ) : (
                          "Inactive"
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div className={pageStyles.tableActions}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className={eb.btnAdd}
                                onClick={() => void saveEdit(uom.code)}
                                disabled={rowBusy || !editDraft.label.trim()}
                              >
                                {savingCode === uom.code ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                className={eb.btnSecondary}
                                onClick={cancelEdit}
                                disabled={rowBusy}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={eb.btnSecondary}
                                onClick={() => startEdit(uom)}
                                disabled={readOnly || (editingCode !== null && editingCode !== uom.code)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className={eb.btnSecondary}
                                onClick={() => void remove(uom.code)}
                                disabled={readOnly || rowBusy || editingCode !== null}
                              >
                                {deletingCode === uom.code ? "Deleting..." : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
