"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./pos-item-map.module.css";

type Mapping = {
  pos_item_id: string;
  pos_item_name?: string | null;
  pos_flavour_id: string | null;
  pos_flavour_name?: string | null;
  catalog_item_id: string;
  catalog_item_name?: string | null;
  catalog_variant_key: string | null;
  normalized_variant_key: string | null;
  catalog_variant_label?: string | null;
  warehouse_id: string | null;
  outlet_id: string;
};

export default function PosItemMapPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const initialForm = {
    pos_item_id: "",
    pos_item_name: "",
    pos_flavour_id: "",
    pos_flavour_name: "",
    catalog_item_id: "",
    catalog_variant_key: "base",
    warehouse_id: "",
    outlet_id: "",
  };
  const [form, setForm] = useState(initialForm);
  const resetForm = () => setForm({ ...initialForm });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/pos-item-map");
      if (!res.ok) throw new Error("Unable to load mappings");
      const json = await res.json();
      setMappings(Array.isArray(json.mappings) ? json.mappings : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load POS item mappings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mappings;
    return mappings.filter((m) => {
      return (
        m.pos_item_id.toLowerCase().includes(term) ||
        (m.pos_item_name ?? "").toLowerCase().includes(term) ||
        (m.pos_flavour_id ?? "").toLowerCase().includes(term) ||
        (m.pos_flavour_name ?? "").toLowerCase().includes(term) ||
        m.catalog_item_id.toLowerCase().includes(term) ||
        (m.catalog_variant_key ?? "").toLowerCase().includes(term) ||
        (m.normalized_variant_key ?? "").toLowerCase().includes(term) ||
        (m.warehouse_id ?? "").toLowerCase().includes(term) ||
        m.outlet_id.toLowerCase().includes(term)
      );
    });
  }, [mappings, search]);

  const isReady = status === "ok";

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Pos/App Match</h1>
            <p className={styles.subtitle}>Mappings between POS item/flavour IDs and catalog items/variants.</p>
            <p className={styles.metaLine}>Showing {filtered.length} rows (total {mappings.length}).</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondaryButton} onClick={() => router.back()}>
              Back
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push("/Warehouse_Backoffice")}>
              Back to Dashboard
            </button>
            <button className={styles.primaryButton} onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {!isReady ? (
          <section className={styles.controls}>
            <div className={styles.error}>Not authorized for catalog.</div>
          </section>
        ) : (
          <>
            <section className={styles.controls}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Search</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by POS item, name, flavour, catalog, variant, or warehouse"
                  className={styles.searchInput}
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </section>

            <section className={styles.tableCard}>
              <div className={styles.tableHead}>
                <span>POS Item ID</span>
                <span>POS Item Name</span>
                <span>POS Flavour ID</span>
                <span>POS Flavour Name</span>
                <span>Catalog Item</span>
                <span>Variant</span>
                <span>Warehouse ID</span>
                <span>Outlet ID</span>
              </div>
              {filtered.length === 0 ? (
                <div className={styles.empty}>No mappings found.</div>
              ) : (
                filtered.map((m) => (
                  <div key={`${m.pos_item_id}-${m.pos_flavour_id ?? "_"}-${m.catalog_item_id}`} className={styles.tableRow}>
                    <span>{m.pos_item_id}</span>
                    <span className={m.pos_item_name ? undefined : styles.muted}>{m.pos_item_name ?? "—"}</span>
                    <span className={m.pos_flavour_id ? undefined : styles.muted}>{m.pos_flavour_id ?? "—"}</span>
                    <span className={m.pos_flavour_name ? undefined : styles.muted}>{m.pos_flavour_name ?? "—"}</span>
                    <span>{m.catalog_item_name || m.catalog_item_id}</span>
                    <span className={styles.badge}>
                      {m.catalog_variant_label || m.catalog_variant_key || m.normalized_variant_key || "base"}
                    </span>
                    <span className={m.warehouse_id ? undefined : styles.muted}>{m.warehouse_id ?? "—"}</span>
                    <span>{m.outlet_id}</span>
                  </div>
                ))
              )}
            </section>

            <section className={styles.tableCard}>
              <div className={styles.tableHead}>
                <span>POS Item ID</span>
                <span>POS Item Name</span>
                <span>POS Flavour ID</span>
                <span>POS Flavour Name</span>
                <span>Catalog Item ID</span>
                <span>Variant Key</span>
                <span>Warehouse ID</span>
                <span>Outlet ID</span>
              </div>
              <div className={styles.tableRow}>
                <input
                  className={styles.searchInput}
                  placeholder="POS item id"
                  value={form.pos_item_id}
                  onChange={(e) => setForm((f) => ({ ...f, pos_item_id: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="POS item name (optional)"
                  value={form.pos_item_name}
                  onChange={(e) => setForm((f) => ({ ...f, pos_item_name: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="POS flavour id (optional)"
                  value={form.pos_flavour_id}
                  onChange={(e) => setForm((f) => ({ ...f, pos_flavour_id: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="POS flavour name (optional)"
                  value={form.pos_flavour_name}
                  onChange={(e) => setForm((f) => ({ ...f, pos_flavour_name: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="Catalog item id"
                  value={form.catalog_item_id}
                  onChange={(e) => setForm((f) => ({ ...f, catalog_item_id: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="Variant key (base if empty)"
                  value={form.catalog_variant_key}
                  onChange={(e) => setForm((f) => ({ ...f, catalog_variant_key: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="Warehouse id (optional)"
                  value={form.warehouse_id}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
                />
                <input
                  className={styles.searchInput}
                  placeholder="Outlet id"
                  value={form.outlet_id}
                  onChange={(e) => setForm((f) => ({ ...f, outlet_id: e.target.value }))}
                />
              </div>
              <div className={`${styles.tableRow} ${styles.rowAction}`}>
                <button
                  className={styles.primaryButton}
                  onClick={async () => {
                    if (!form.pos_item_id.trim() || !form.catalog_item_id.trim() || !form.outlet_id.trim()) {
                      setError("POS item id, catalog item id, and outlet id are required");
                      return;
                    }
                    setCreating(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/catalog/pos-item-map", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          pos_item_id: form.pos_item_id.trim(),
                          pos_item_name: form.pos_item_name.trim() || null,
                          pos_flavour_id: form.pos_flavour_id.trim() || null,
                          pos_flavour_name: form.pos_flavour_name.trim() || null,
                          catalog_item_id: form.catalog_item_id.trim(),
                          catalog_variant_key: form.catalog_variant_key.trim() || "base",
                          warehouse_id: form.warehouse_id.trim() || null,
                          outlet_id: form.outlet_id.trim(),
                        }),
                      });
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body.error || "Failed to create mapping");
                      }
                      resetForm();
                      await load();
                    } catch (err) {
                      console.error(err);
                      setError(err instanceof Error ? err.message : "Failed to create mapping");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create Map"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
