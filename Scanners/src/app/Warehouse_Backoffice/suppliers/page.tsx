"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import eb from "../enterprise.module.css";
import styles from "./suppliers.module.css";

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_number: string | null;
  notes: string | null;
  active: boolean;
  scanner_ids?: string[] | null;
  scanners?: Array<{ id: string; name: string | null }> | null;
};

type SupplierForm = {
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  whatsapp_number: string;
  notes: string;
  active: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export default function SuppliersPage() {
  const { status } = useWarehouseAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>({
    name: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    whatsapp_number: "",
    notes: "",
    active: true,
  });

  const canSubmit = form.name.trim().length > 0 && !saving;

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/suppliers", { cache: "no-store" });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info.error || "Unable to load suppliers");
      }
      const payload = await response.json();
      setSuppliers(Array.isArray(payload?.suppliers) ? payload.suppliers : []);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "ok") return;
    void loadSuppliers();
  }, [status]);

  const handleChange = (field: keyof SupplierForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleActiveChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, active: event.target.checked }));
  };

  const resetForm = () => {
    setForm({
      name: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      whatsapp_number: "",
      notes: "",
      active: true,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const wasEditing = !!editingId;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const requestPayload = { ...form };
      const response = await fetch("/api/suppliers", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...requestPayload } : requestPayload),
      });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info.error || (wasEditing ? "Unable to update supplier" : "Unable to create supplier"));
      }
      const responsePayload = await response.json();
      const created = responsePayload?.supplier as Supplier | undefined;
      if (created) {
        setSuppliers((prev) => {
          if (wasEditing) {
            return prev.map((supplier) => (supplier.id === created.id ? { ...created } : supplier));
          }
          return [{ ...created }, ...prev];
        });
      } else {
        await loadSuppliers();
      }
      resetForm();
      setEditingId(null);
      setSuccess(wasEditing ? "Supplier updated." : "Supplier saved.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(() => suppliers.filter((s) => s.active).length, [suppliers]);

  const startEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name ?? "",
      contact_name: supplier.contact_name ?? "",
      contact_phone: supplier.contact_phone ?? "",
      contact_email: supplier.contact_email ?? "",
      whatsapp_number: supplier.whatsapp_number ?? "",
      notes: supplier.notes ?? "",
      active: supplier.active ?? true,
    });
    setSuccess(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  if (status !== "ok") {
    return (
      <section className={eb.pageCard}>
        <p className={eb.pageCardBody}>Not authorized for suppliers.</p>
      </section>
    );
  }

  return (
    <div>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Suppliers
          </h3>
          <p className={eb.pageCardBody}>
            Create and manage supplier contacts for warehouse operations.
          </p>
        </div>
        <div className={eb.summaryGrid} style={{ marginTop: 16 }}>
          <div className={`${eb.summaryCard} ${eb.summaryCardBlue}`}>
            <p className={eb.summaryLabel}>Total</p>
            <p className={eb.summaryValue}>{suppliers.length}</p>
          </div>
          <div className={`${eb.summaryCard} ${eb.summaryCardGreen}`}>
            <p className={eb.summaryLabel}>Active</p>
            <p className={eb.summaryValue}>{activeCount}</p>
          </div>
          <div className={`${eb.summaryCard} ${eb.summaryCardGold}`}>
            <p className={eb.summaryLabel}>Inactive</p>
            <p className={eb.summaryValue}>{suppliers.length - activeCount}</p>
          </div>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={eb.pageCard}>
          <div className={eb.sectionHeaderGreen}>
            <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
              {editingId ? "Edit supplier" : "Add supplier"}
            </h3>
            <p className={eb.pageCardBody}>Required fields are marked. Supplier names must be unique.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Supplier name *</span>
              <input
                className={styles.input}
                value={form.name}
                onChange={handleChange("name")}
                placeholder="Supplier name"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Contact name</span>
              <input
                className={styles.input}
                value={form.contact_name}
                onChange={handleChange("contact_name")}
                placeholder="Primary contact"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Contact phone</span>
              <input
                className={styles.input}
                value={form.contact_phone}
                onChange={handleChange("contact_phone")}
                placeholder="+61 …"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Contact email</span>
              <input
                className={styles.input}
                type="email"
                value={form.contact_email}
                onChange={handleChange("contact_email")}
                placeholder="email@example.com"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>WhatsApp number</span>
              <input
                className={styles.input}
                value={form.whatsapp_number}
                onChange={handleChange("whatsapp_number")}
                placeholder="+61 …"
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.label}>Notes</span>
              <textarea
                className={styles.textarea}
                value={form.notes}
                onChange={handleChange("notes")}
                placeholder="Delivery days, account terms, etc."
              />
            </label>
            <label className={styles.checkboxRow}>
              <input className={styles.checkboxInput} type="checkbox" checked={form.active} onChange={handleActiveChange} />
              Active supplier
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={eb.btnAdd} disabled={!canSubmit}>
                {saving ? "Saving…" : editingId ? "Update supplier" : "Save supplier"}
              </button>
              {editingId ? (
                <button type="button" className={eb.btnSecondary} onClick={cancelEdit}>
                  Cancel
                </button>
              ) : null}
            </div>
            {error ? <p className={`${styles.callout} ${styles.calloutError}`}>{error}</p> : null}
            {success ? <p className={`${styles.callout} ${styles.calloutSuccess}`}>{success}</p> : null}
          </form>
        </section>

        <section className={eb.pageCard}>
          <div className={styles.listHeader}>
            <div className={eb.sectionHeaderGold}>
              <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
                Supplier directory
              </h3>
              <p className={eb.pageCardBody}>{loading ? "Loading suppliers…" : `${activeCount} active suppliers`}</p>
            </div>
            <button className={eb.btnSecondary} onClick={loadSuppliers} disabled={loading}>
              Refresh
            </button>
          </div>

          {suppliers.length === 0 ? (
            <p className={styles.empty}>No suppliers found. Add your first supplier on the left.</p>
          ) : (
            <>
              <div className={styles.listHeaderRow}>
                <span>Supplier</span>
                <span>Status</span>
              </div>
              <div className={`${styles.list} ${styles.listWithHeader}`}>
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className={styles.listItem}>
                    <div>
                      <h3 className={styles.listTitle}>{supplier.name}</h3>
                      <p className={styles.listMeta}>
                        {supplier.contact_name ? `Contact: ${supplier.contact_name}` : "No contact name"}
                        {supplier.contact_phone ? ` · ${supplier.contact_phone}` : ""}
                        {supplier.contact_email ? ` · ${supplier.contact_email}` : ""}
                        {supplier.whatsapp_number ? ` · WhatsApp: ${supplier.whatsapp_number}` : ""}
                      </p>
                      {supplier.notes ? <p className={styles.listNotes}>{supplier.notes}</p> : null}
                      <div className={styles.listActions}>
                        <button type="button" className={eb.btnSecondary} onClick={() => startEdit(supplier)}>
                          Edit
                        </button>
                      </div>
                    </div>
                    <span className={supplier.active ? eb.pillLive : eb.pillOffline}>
                      {supplier.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
