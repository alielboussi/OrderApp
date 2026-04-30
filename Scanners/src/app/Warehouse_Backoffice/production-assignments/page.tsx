"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import shellStyles from "../dashboard.module.css";
import menuStyles from "../menu.module.css";
import styles from "./production-assignments.module.css";

type WarehouseOption = { id: string; name: string | null; code: string | null; active?: boolean | null };

type CatalogItem = {
  id: string;
  name: string | null;
  item_kind: string | null;
  has_recipe: boolean | null;
};

type ProductionAssignment = {
  id: string;
  finished_item_id: string;
  warehouse_id: string;
  variant_key: string | null;
  active: boolean | null;
};

export default function ProductionAssignmentsPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [assignments, setAssignments] = useState<ProductionAssignment[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadWarehouses = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("warehouses")
          .select("id,name,code,active")
          .order("name", { ascending: true });

        if (loadError) throw loadError;
        if (!active) return;

        const list = (data as WarehouseOption[] | null) ?? [];
        const activeWarehouses = list.filter((warehouse) => warehouse.active !== false);
        setWarehouses(activeWarehouses);
        if (!warehouseId && activeWarehouses.length > 0) {
          setWarehouseId(activeWarehouses[0].id);
        }
      } catch (err) {
        if (!active) return;
        setWarehouses([]);
        setError((err as Error).message ?? "Failed to load warehouses.");
      }
    };

    loadWarehouses();
    return () => {
      active = false;
    };
  }, [status, supabase, warehouseId]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadItems = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("catalog_items")
          .select("id,name,item_kind,has_recipe")
          .eq("has_recipe", true)
          .order("name", { ascending: true });

        if (loadError) throw loadError;
        if (!active) return;
        setItems((data as CatalogItem[] | null) ?? []);
      } catch (err) {
        if (!active) return;
        setItems([]);
        setError((err as Error).message ?? "Failed to load items.");
      }
    };

    loadItems();
    return () => {
      active = false;
    };
  }, [status, supabase]);

  useEffect(() => {
    if (status !== "ok" || !warehouseId) return;
    let active = true;

    const loadAssignments = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from("production_item_assignments")
          .select("id,finished_item_id,warehouse_id,variant_key,active")
          .eq("warehouse_id", warehouseId)
          .order("finished_item_id", { ascending: true });

        if (loadError) throw loadError;
        if (!active) return;
        setAssignments((data as ProductionAssignment[] | null) ?? []);
      } catch (err) {
        if (!active) return;
        setAssignments([]);
        setError((err as Error).message ?? "Failed to load assignments.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAssignments();
    return () => {
      active = false;
    };
  }, [status, supabase, warehouseId]);

  useEffect(() => {
    if (items.length === 0) return;
    const next: Record<string, string> = {};
    items.forEach((item) => {
      const activeAssignment = assignments.find(
        (assignment) => assignment.finished_item_id === item.id && assignment.active !== false
      );
      next[item.id] = activeAssignment?.warehouse_id ?? "";
    });
    setSelections(next);
  }, [items, assignments]);

  const filteredItems = items.filter((item) => {
    const name = item.name?.toLowerCase() ?? "";
    return name.includes(search.trim().toLowerCase());
  });

  const handleSave = async (itemId: string) => {
    if (!warehouseId) return;
    const selectedWarehouse = selections[itemId] || "";
    setSavingId(itemId);

    try {
      if (!selectedWarehouse) {
        const { error: updateError } = await supabase
          .from("production_item_assignments")
          .update({ active: false })
          .eq("finished_item_id", itemId);
        if (updateError) throw updateError;
      } else {
        const { error: upsertError } = await supabase
          .from("production_item_assignments")
          .upsert(
            {
              finished_item_id: itemId,
              warehouse_id: selectedWarehouse,
              variant_key: "base",
              active: true,
            },
            { onConflict: "finished_item_id,warehouse_id,variant_key" }
          );
        if (upsertError) throw upsertError;

        const { error: deactivateError } = await supabase
          .from("production_item_assignments")
          .update({ active: false })
          .eq("finished_item_id", itemId)
          .neq("warehouse_id", selectedWarehouse);
        if (deactivateError) throw deactivateError;
      }

      const { data, error: reloadError } = await supabase
        .from("production_item_assignments")
        .select("id,finished_item_id,warehouse_id,variant_key,active")
        .eq("warehouse_id", warehouseId)
        .order("finished_item_id", { ascending: true });

      if (reloadError) throw reloadError;
      setAssignments((data as ProductionAssignment[] | null) ?? []);
    } catch (err) {
      setError((err as Error).message ?? "Failed to save assignment.");
    } finally {
      setSavingId(null);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={shellStyles.page}>
      <style>{globalStyles}</style>
      <main className={shellStyles.shell}>
        <header className={shellStyles.hero}>
          <div className={shellStyles.grow}>
            <p className={shellStyles.kicker}>AfterTen Logistics</p>
            <h1 className={shellStyles.title}>Production Assignments</h1>
            <p className={shellStyles.subtitle}>Map finished items to the warehouse that produces them.</p>
          </div>
          <div className={menuStyles.headerButtons}>
            <button onClick={() => router.back()} className={menuStyles.backButton}>
              Back
            </button>
            <button onClick={() => router.push("/Warehouse_Backoffice")} className={menuStyles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.controls}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="warehouse-select">
              Warehouse
            </label>
            <select
              id="warehouse-select"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              className={styles.select}
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name ?? warehouse.code ?? warehouse.id}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="search">
              Search
            </label>
            <input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={styles.input}
              placeholder="Search finished items"
            />
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}
        {!error && items.length === 0 && !loading && (
          <p className={styles.notice}>No finished items with recipes found.</p>
        )}

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.tableTitle}>Assignments</h2>
              <p className={styles.tableMeta}>{filteredItems.length} items</p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Finished item</th>
                  <th>Assigned warehouse</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const selected = selections[item.id] ?? "";
                  const isAssigned = Boolean(selected);
                  return (
                    <tr key={item.id}>
                      <td>{item.name ?? "Unnamed"}</td>
                      <td>
                        <select
                          className={styles.select}
                          value={selected}
                          onChange={(event) =>
                            setSelections((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          aria-label={`Assign warehouse for ${item.name ?? "item"}`}
                        >
                          <option value="">Unassigned</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name ?? warehouse.code ?? warehouse.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={styles.muted}>{isAssigned ? "Assigned" : "Not assigned"}</td>
                      <td>
                        <button
                          className={styles.actionButton}
                          onClick={() => handleSave(item.id)}
                          disabled={savingId === item.id}
                        >
                          {savingId === item.id ? "Saving" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-2px);
}
`;
