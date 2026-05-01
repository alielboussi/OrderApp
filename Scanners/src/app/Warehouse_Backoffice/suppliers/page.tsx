"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
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
  const router = useRouter();
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
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
        throw new Error(info.error || (editingId ? "Unable to update supplier" : "Unable to create supplier"));
      }
      const responsePayload = await response.json();
      const created = responsePayload?.supplier as Supplier | undefined;
      if (created) {
        setSuppliers((prev) => {
          if (editingId) {
            return prev.map((supplier) =>
              supplier.id === created.id
                ? { ...created }
                : supplier
            );
          }
          return [{ ...created }, ...prev];
        });
      } else {
        await loadSuppliers();
      }
      setForm({
        name: "",
        contact_name: "",
        contact_phone: "",
        contact_email: "",
        whatsapp_number: "",
        notes: "",
        active: true,
      });
      setEditingId(null);
      setSuccess(editingId ? "Supplier updated." : "Supplier saved.");
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

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <p className={styles.kicker}>Warehouse Backoffice</p>
            <h1 className={styles.title}>Suppliers</h1>
            <p className={styles.subtitle}>Create suppliers so scanners can attach purchases and inventory to the right partner.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.backButton} onClick={() => router.back()}>Back</button>
            <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>Dashboard</button>
          </div>
        </header>

        <section className={styles.contentGrid}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{editingId ? "Edit supplier" : "Add supplier"}</h2>
            <p className={styles.cardHint}>Required fields are marked. Supplier names must be unique.</p>
            <form onSubmit={handleSubmit} className={styles.formGrid}>
              <label className={styles.label}
                >Supplier name *
                <input className={styles.input} value={form.name} onChange={handleChange("name")} placeholder="Supplier name" required />
              </label>
              <label className={styles.label}
                >Contact name
                <input className={styles.input} value={form.contact_name} onChange={handleChange("contact_name")} placeholder="Primary contact" />
              </label>
              <label className={styles.label}
                >Contact phone
                <input className={styles.input} value={form.contact_phone} onChange={handleChange("contact_phone")} placeholder="+61 ..." />
              </label>
              <label className={styles.label}
                >Contact email
                <input className={styles.input} type="email" value={form.contact_email} onChange={handleChange("contact_email")} placeholder="email@example.com" />
              </label>
              <label className={styles.label}
                >WhatsApp number
                <input className={styles.input} value={form.whatsapp_number} onChange={handleChange("whatsapp_number")} placeholder="+61 ..." />
              </label>
              <label className={styles.label}
                >Notes
                <textarea className={styles.textarea} value={form.notes} onChange={handleChange("notes")} placeholder="Delivery days, account terms, etc." />
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={form.active} onChange={handleActiveChange} />
                Active supplier
              </label>
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
                  {saving ? "Saving..." : editingId ? "Update supplier" : "Save supplier"}
                </button>
                {editingId ? (
                  <button type="button" className={styles.secondaryButton} onClick={cancelEdit}>
                    Cancel
                  </button>
                ) : null}
              </div>
              {error ? <p className={styles.error}>Error: {error}</p> : null}
              {success ? <p className={styles.success}>{success}</p> : null}
            </form>
          </div>

          <div className={styles.card}>
            <div className={styles.listHeader}>
              <div>
                <h2 className={styles.cardTitle}>Supplier directory</h2>
                <p className={styles.cardHint}>{loading ? "Loading suppliers..." : `${activeCount} active suppliers`}</p>
              </div>
              <button className={styles.secondaryButton} onClick={loadSuppliers} disabled={loading}>Refresh</button>
            </div>
            <div className={styles.list}>
              {suppliers.length === 0 ? (
                <p className={styles.empty}>No suppliers found. Add your first supplier on the left.</p>
              ) : (
                <div className={styles.listHeaderRow}>
                  <span>Supplier</span>
                  <span>Status</span>
                </div>
              )}
            </div>
            <div className={styles.list}>
              {suppliers.length === 0 ? null : (
                suppliers.map((supplier) => (
                  <div key={supplier.id} className={styles.listItem}>
                    <div>
                      <h3 className={styles.listTitle}>{supplier.name}</h3>
                      <p className={styles.listMeta}>
                        {supplier.contact_name ? `Contact: ${supplier.contact_name}` : "No contact name"}
                        {supplier.contact_phone ? ` · ${supplier.contact_phone}` : ""}
                        {supplier.contact_email ? ` · ${supplier.contact_email}` : ""}
                        {supplier.whatsapp_number ? ` · WhatsApp: ${supplier.whatsapp_number}` : ""}
                      </p>
                      <button type="button" className={styles.secondaryButton} onClick={() => startEdit(supplier)}>
                        Edit
                      </button>
                      {supplier.notes ? <p className={styles.listNotes}>{supplier.notes}</p> : null}
                    </div>
                    <span className={supplier.active ? styles.activePill : styles.inactivePill}>
                      {supplier.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
