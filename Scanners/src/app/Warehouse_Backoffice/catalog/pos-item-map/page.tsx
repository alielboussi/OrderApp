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

type Outlet = { id: string; name: string; code?: string | null };
type Warehouse = { id: string; name: string; code?: string | null };
type Item = { id: string; name: string };
type Variant = { id: string; item_id: string; name?: string | null };

export default function PosItemMapPage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [duplicateOutletId, setDuplicateOutletId] = useState("");
  const [duplicateWarehouseId, setDuplicateWarehouseId] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [selectedVariantKeys, setSelectedVariantKeys] = useState<string[]>([]);
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

  const getMappingKey = (mapping: Mapping) =>
    `${mapping.pos_item_id}-${mapping.pos_flavour_id ?? "_"}-${mapping.catalog_item_id}-${mapping.catalog_variant_key ?? "base"}-${mapping.outlet_id}-${mapping.warehouse_id ?? "_"}`;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mapRes, outletRes, warehouseRes, itemRes, variantRes] = await Promise.all([
        fetch("/api/catalog/pos-item-map"),
        fetch("/api/outlets"),
        fetch("/api/warehouses"),
        fetch("/api/catalog/items"),
        fetch("/api/catalog/variants"),
      ]);

      if (!mapRes.ok) throw new Error("Unable to load mappings");
      const mapJson = await mapRes.json();
      setMappings(Array.isArray(mapJson.mappings) ? mapJson.mappings : []);

      if (outletRes.ok) {
        const json = await outletRes.json();
        setOutlets(Array.isArray(json.outlets) ? json.outlets : []);
      }
      if (warehouseRes.ok) {
        const json = await warehouseRes.json();
        setWarehouses(Array.isArray(json.warehouses) ? json.warehouses : []);
      }
      if (itemRes.ok) {
        const json = await itemRes.json();
        setItems(Array.isArray(json.items) ? json.items : []);
      }
      if (variantRes.ok) {
        const json = await variantRes.json();
        setVariants(Array.isArray(json.variants) ? json.variants : []);
      }
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

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const filteredKeys = useMemo(() => filtered.map((m) => getMappingKey(m)), [filtered]);
  const allFilteredSelected = filteredKeys.length > 0 && filteredKeys.every((key) => selectedSet.has(key));

  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleSelectAllFiltered = () => {
    if (filteredKeys.length === 0) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (filteredKeys.every((key) => next.has(key))) {
        filteredKeys.forEach((key) => next.delete(key));
      } else {
        filteredKeys.forEach((key) => next.add(key));
      }
      return Array.from(next);
    });
  };

  const outletOptions = useMemo(
    () => outlets.map((o) => ({ value: o.id, label: `${o.name}${o.code ? ` (${o.code})` : ""}` })),
    [outlets]
  );

  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: w.id, label: `${w.name}${w.code ? ` (${w.code})` : ""}` })),
    [warehouses]
  );

  const itemOptions = useMemo(() => [{ value: "", label: "Select catalog item" }, ...items.map((i) => ({ value: i.id, label: i.name }))], [items]);

  const variantOptions = useMemo(() => {
    if (!form.catalog_item_id) return [{ value: "base", label: "Base" }];
    const scoped = variants.filter((v) => v.item_id === form.catalog_item_id);
    const base = { value: "base", label: "Base" };
    if (!scoped.length) return [base];
    return [base, ...scoped.map((v) => ({ value: v.id, label: v.name || v.id }))];
  }, [form.catalog_item_id, variants]);

  const warehouseNameById = useMemo(() => Object.fromEntries(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const outletNameById = useMemo(() => Object.fromEntries(outlets.map((o) => [o.id, o.name])), [outlets]);
  const variantLabelById = useMemo(() => {
    const map: Record<string, string> = { base: "base" };
    variants.forEach((v) => {
      map[v.id] = v.name || v.id;
    });
    return map;
  }, [variants]);

  const isReady = status === "ok";

  const deleteMapping = async (mapping: Mapping) => {
    if (readOnly) {
      setError("Read-only access: deleting is disabled.");
      return;
    }
    setError(null);
    const key = getMappingKey(mapping);
    setDeletingKey(key);
    try {
      const params = new URLSearchParams({
        pos_item_id: mapping.pos_item_id,
        catalog_item_id: mapping.catalog_item_id,
        outlet_id: mapping.outlet_id,
      });
      if (mapping.pos_flavour_id) params.set("pos_flavour_id", mapping.pos_flavour_id);
      if (mapping.catalog_variant_key) params.set("catalog_variant_key", mapping.catalog_variant_key);
      if (mapping.warehouse_id) params.set("warehouse_id", mapping.warehouse_id);

      const response = await fetch(`/api/catalog/pos-item-map?${params.toString()}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to delete mapping");
      }
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to delete mapping");
    } finally {
      setDeletingKey(null);
    }
  };

  const duplicateSelected = async () => {
    if (readOnly) {
      setError("Read-only access: duplicating is disabled.");
      return;
    }
    if (!duplicateOutletId) {
      setError("Select an outlet to duplicate into.");
      return;
    }
    const selected = mappings.filter((m) => selectedSet.has(getMappingKey(m)));
    if (!selected.length) {
      setError("Select at least one mapping to duplicate.");
      return;
    }
    setDuplicating(true);
    setError(null);
    try {
      await Promise.all(
        selected.map(async (m) => {
          const response = await fetch("/api/catalog/pos-item-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pos_item_id: m.pos_item_id,
              pos_item_name: m.pos_item_name ?? null,
              pos_flavour_id: m.pos_flavour_id ?? null,
              pos_flavour_name: m.pos_flavour_name ?? null,
              catalog_item_id: m.catalog_item_id,
              catalog_variant_key: m.catalog_variant_key ?? "base",
              warehouse_id: duplicateWarehouseId || m.warehouse_id || null,
              outlet_id: duplicateOutletId,
            }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.error || "Failed to duplicate mapping");
          }
        })
      );
      setSelectedKeys([]);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to duplicate mappings");
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Pos/App Match</h1>
            <p className={styles.subtitle}>
              Map POS items/flavours to catalog item + variant + warehouse per outlet. Deductions use outlet_item_routes and outlet defaults; this table links the POS sale to the correct SKU.
            </p>
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
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Duplicate to outlet</label>
                <select
                  className={styles.searchInput}
                  value={duplicateOutletId}
                  onChange={(e) => setDuplicateOutletId(e.target.value)}
                  aria-label="Select outlet to duplicate"
                >
                  <option value="">Select outlet</option>
                  {outletOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Duplicate warehouse</label>
                <select
                  className={styles.searchInput}
                  value={duplicateWarehouseId}
                  onChange={(e) => setDuplicateWarehouseId(e.target.value)}
                  aria-label="Select warehouse override"
                >
                  <option value="">Keep original warehouse</option>
                  {warehouseOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Selected</label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void duplicateSelected()}
                  disabled={duplicating || readOnly || selectedKeys.length === 0}
                >
                  {readOnly ? "Read-only" : duplicating ? "Duplicating..." : "Duplicate selected"}
                </button>
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </section>

            <section className={styles.tableCard}>
              <div className={styles.tableHead}>
                <span>
                  <input
                    type="checkbox"
                    aria-label="Select all filtered mappings"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                  />
                </span>
                <span>POS Item ID</span>
                <span>POS Item Name</span>
                <span>POS Flavour ID</span>
                <span>POS Flavour Name</span>
                <span>Catalog Item</span>
                <span>Variant</span>
                <span>Warehouse</span>
                <span>Outlet</span>
                <span>Actions</span>
              </div>
              {filtered.length === 0 ? (
                <div className={styles.empty}>No mappings found.</div>
              ) : (
                filtered.map((m) => (
                  <div
                    key={`${m.pos_item_id}-${m.pos_flavour_id ?? "_"}-${m.catalog_item_id}-${m.catalog_variant_key ?? "base"}-${m.outlet_id}`}
                    className={styles.tableRow}
                  >
                    <span>
                      <input
                        type="checkbox"
                        aria-label={`Select mapping ${m.pos_item_id}`}
                        checked={selectedSet.has(getMappingKey(m))}
                        onChange={() => toggleSelection(getMappingKey(m))}
                      />
                    </span>
                    <span>{m.pos_item_id}</span>
                    <span className={m.pos_item_name ? undefined : styles.muted}>{m.pos_item_name ?? "—"}</span>
                    <span className={m.pos_flavour_id ? undefined : styles.muted}>{m.pos_flavour_id ?? "—"}</span>
                    <span className={m.pos_flavour_name ? undefined : styles.muted}>{m.pos_flavour_name ?? "—"}</span>
                    <span>{m.catalog_item_name || m.catalog_item_id}</span>
                    <span className={styles.badge}>
                      {m.catalog_variant_label || variantLabelById[m.catalog_variant_key || "base"] || m.catalog_variant_key || m.normalized_variant_key || "base"}
                    </span>
                    <span className={m.warehouse_id ? undefined : styles.muted}>{warehouseNameById[m.warehouse_id ?? ""] ?? m.warehouse_id ?? "—"}</span>
                    <span>{outletNameById[m.outlet_id] ?? m.outlet_id}</span>
                    <span>
                      <button
                        type="button"
                        className={styles.rowButton}
                        onClick={() => void deleteMapping(m)}
                        disabled={readOnly || deletingKey === getMappingKey(m)}
                      >
                        {deletingKey === getMappingKey(m)
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </span>
                  </div>
                ))
              )}
            </section>

            <section className={`${styles.tableCard} ${styles.formCard}`}>
              <div className={styles.tableHead}>
                <span></span>
                <span>POS Item ID</span>
                <span>POS Item Name</span>
                <span>POS Flavour ID</span>
                <span>POS Flavour Name</span>
                <span>Catalog Item</span>
                <span>Variant</span>
                <span>Warehouse</span>
                <span>Outlet</span>
                <span></span>
              </div>
              <div className={`${styles.tableRow} ${styles.formRow}`}>
                <input
                  className={styles.searchInput}
                  placeholder="POS item id (from POS)"
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
              </div>
              <div className={`${styles.tableRow} ${styles.formRow}`}>
                <select
                  className={styles.searchInput}
                  value={form.catalog_item_id}
                  onChange={(e) => {
                    const next = e.target.value;
                    setForm((f) => ({ ...f, catalog_item_id: next, catalog_variant_key: "base" }));
                    setSelectedVariantKeys([]);
                  }}
                  aria-label="Select catalog item"
                >
                  {itemOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className={styles.variantChooser} aria-label="Catalog variants">
                  {!form.catalog_item_id ? (
                    <div className={styles.variantHint}>Select a product to choose variants</div>
                  ) : (
                    <div className={styles.variantList}>
                      {variantOptions.map((opt) => {
                        const checked = selectedVariantKeys.includes(opt.value);
                        return (
                          <label key={opt.value} className={styles.variantOption}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setSelectedVariantKeys((prev) => {
                                  if (isChecked) return Array.from(new Set([...prev, opt.value]));
                                  return prev.filter((v) => v !== opt.value);
                                });
                                if (isChecked) {
                                  setForm((f) => ({ ...f, catalog_variant_key: opt.value }));
                                }
                              }}
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                      <div className={styles.variantHint}>Select one or more variants to map.</div>
                    </div>
                  )}
                </div>
                <select
                  className={styles.searchInput}
                  value={form.warehouse_id}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
                  aria-label="Select warehouse"
                >
                  <option value="">Warehouse (optional)</option>
                  {warehouseOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.searchInput}
                  value={form.outlet_id}
                  onChange={(e) => setForm((f) => ({ ...f, outlet_id: e.target.value }))}
                  aria-label="Select outlet"
                >
                  <option value="">Select outlet</option>
                  {outletOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.tableRow} ${styles.rowAction}`}>
                <button
                  className={styles.primaryButton}
                  onClick={async () => {
                    if (readOnly) {
                      setError("Read-only access: saving is disabled.");
                      return;
                    }
                    if (!form.catalog_item_id.trim() || !form.outlet_id.trim()) {
                      setError("Catalog item and outlet are required");
                      return;
                    }
                    setCreating(true);
                    setError(null);
                    try {
                      const selectedCatalog = items.find((it) => it.id === form.catalog_item_id.trim());
                      const derivedPosItemId = form.pos_item_id.trim();
                      const derivedPosItemName = form.pos_item_name.trim() || selectedCatalog?.name || null;
                      const variantKeys = selectedVariantKeys.length
                        ? selectedVariantKeys
                        : variantOptions.length === 1 && variantOptions[0]?.value === "base"
                        ? ["base"]
                        : [];
                      if (!variantKeys.length) {
                        setError("Select at least one variant (or base).");
                        return;
                      }
                      if (!derivedPosItemId) {
                        setError("POS item id is required");
                        return;
                      }
                      if (derivedPosItemId === form.catalog_item_id.trim()) {
                        setError("POS item id cannot be the same as the catalog item id");
                        return;
                      }
                      await Promise.all(
                        variantKeys.map((variantKey) =>
                          fetch("/api/catalog/pos-item-map", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              pos_item_id: derivedPosItemId,
                              pos_item_name: derivedPosItemName,
                              pos_flavour_id: form.pos_flavour_id.trim() || null,
                              pos_flavour_name: form.pos_flavour_name.trim() || null,
                              catalog_item_id: form.catalog_item_id.trim(),
                              catalog_variant_key: variantKey || "base",
                              warehouse_id: form.warehouse_id.trim() || null,
                              outlet_id: form.outlet_id.trim(),
                            }),
                          })
                        )
                      );
                      resetForm();
                      setSelectedVariantKeys([]);
                      await load();
                    } catch (err) {
                      console.error(err);
                      setError(err instanceof Error ? err.message : "Failed to create mapping");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  disabled={creating || readOnly}
                >
                  {readOnly ? "Read-only" : creating ? "Creating..." : "Create Map"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
