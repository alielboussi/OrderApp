"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "./outlet-warehouse-assignments.module.css";

type Outlet = {
  id: string;
  name: string | null;
  code?: string | null;
  active?: boolean | null;
};

type Warehouse = {
  id: string;
  name: string | null;
  code?: string | null;
  active?: boolean | null;
};

type Assignment = {
  outlet_id: string | null;
  warehouse_id: string | null;
  show_in_stocktake?: boolean | null;
};

export default function OutletWarehouseAssignmentsPage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [outletId, setOutletId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [showInStocktake, setShowInStocktake] = useState(true);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: outletData, error: outletError }, { data: warehouseData, error: warehouseError }, { data: assignmentData, error: assignError }] =
        await Promise.all([
          supabase.from("outlets").select("id,name,code,active").order("name"),
          supabase.from("warehouses").select("id,name,code,active").order("name"),
          supabase.from("outlet_warehouses").select("outlet_id,warehouse_id,show_in_stocktake"),
        ]);

      if (outletError) throw outletError;
      if (warehouseError) throw warehouseError;
      if (assignError) throw assignError;

      setOutlets((outletData ?? []) as Outlet[]);
      setWarehouses((warehouseData ?? []) as Warehouse[]);
      setAssignments((assignmentData ?? []) as Assignment[]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load outlet warehouses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "ok") return;
    void load();
  }, [status]);

  const outletLabelById = useMemo(() => {
    const map = new Map<string, string>();
    outlets.forEach((o) => {
      if (!o?.id) return;
      map.set(o.id, o.name ?? o.id);
    });
    return map;
  }, [outlets]);

  const warehouseLabelById = useMemo(() => {
    const map = new Map<string, string>();
    warehouses.forEach((w) => {
      if (!w?.id) return;
      map.set(w.id, w.name ?? w.id);
    });
    return map;
  }, [warehouses]);

  const handleAssign = async () => {
    if (readOnly) {
      setError("Read-only access: saving is disabled.");
      return;
    }
    if (!outletId || !warehouseId) {
      setError("Select both outlet and warehouse.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from("outlet_warehouses")
        .upsert(
          { outlet_id: outletId, warehouse_id: warehouseId, show_in_stocktake: showInStocktake },
          { onConflict: "outlet_id,warehouse_id", ignoreDuplicates: true }
        );
      if (insertError) {
        const message = insertError.message || JSON.stringify(insertError);
        throw new Error(message);
      }
      setOutletId("");
      setWarehouseId("");
      setShowInStocktake(true);
      await load();
    } catch (err) {
      console.error("handleAssign failed", err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      setError(message || "Failed to assign outlet warehouse");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Assignment) => {
    if (readOnly) {
      setError("Read-only access: deleting is disabled.");
      return;
    }
    if (!row.outlet_id || !row.warehouse_id) return;
    const key = `${row.outlet_id}-${row.warehouse_id}`;
    setDeleteKey(key);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("outlet_warehouses")
        .delete()
        .match({ outlet_id: row.outlet_id, warehouse_id: row.warehouse_id });
      if (deleteError) {
        const message = deleteError.message || JSON.stringify(deleteError);
        throw new Error(message);
      }
      await load();
    } catch (err) {
      console.error("handleDelete failed", err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      setError(message || "Failed to delete assignment");
    } finally {
      setDeleteKey(null);
    }
  };

  const handleToggleStocktake = async (row: Assignment, nextValue: boolean) => {
    if (readOnly) {
      setError("Read-only access: saving is disabled.");
      return;
    }
    if (!row.outlet_id || !row.warehouse_id) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("outlet_warehouses")
        .update({ show_in_stocktake: nextValue })
        .match({ outlet_id: row.outlet_id, warehouse_id: row.warehouse_id });
      if (updateError) {
        const message = updateError.message || JSON.stringify(updateError);
        throw new Error(message);
      }
      await load();
    } catch (err) {
      console.error("handleToggleStocktake failed", err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      setError(message || "Failed to update stocktake visibility");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet → Warehouse Assignments</h1>
            <p className={styles.subtitle}>Link outlets to warehouses for stock period and POS validation.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>Back</button>
            <button onClick={handleBack} className={styles.backButton}>Back to Dashboard</button>
          </div>
        </header>

        <section className={styles.card}>
          <div className={styles.formRow}>
            <label className={styles.label}>
              Outlet
              <select
                className={styles.input}
                value={outletId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setOutletId(event.target.value)}
              >
                <option value="">Select outlet</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name ?? o.id}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              Warehouse
              <select
                className={styles.input}
                value={warehouseId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setWarehouseId(event.target.value)}
              >
                <option value="">Select warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name ?? w.id}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              Show in stocktake
              <select
                className={styles.input}
                value={showInStocktake ? "yes" : "no"}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setShowInStocktake(event.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} onClick={handleAssign} disabled={saving || readOnly}>
                {readOnly ? "Read-only" : saving ? "Saving..." : "Add Assignment"}
              </button>
            </div>
          </div>
          {error ? <p className={styles.error}>Error: {error}</p> : null}
        </section>

        <section className={styles.card}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Current Assignments</h2>
            <p className={styles.tableNote}>{loading ? "Loading..." : `${assignments.length} rows`}</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Warehouse</th>
                  <th>Show in stocktake</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>No assignments yet.</td>
                  </tr>
                ) : (
                  assignments.map((row) => (
                    <tr key={`${row.outlet_id ?? "_"}-${row.warehouse_id ?? "_"}`}>
                      <td>{row.outlet_id ? outletLabelById.get(row.outlet_id) ?? row.outlet_id : "—"}</td>
                      <td>{row.warehouse_id ? warehouseLabelById.get(row.warehouse_id) ?? row.warehouse_id : "—"}</td>
                      <td>
                        <select
                          aria-label={`Show ${row.warehouse_id ? warehouseLabelById.get(row.warehouse_id) ?? row.warehouse_id : "warehouse"} in stocktake`}
                          className={styles.input}
                          value={row.show_in_stocktake === false ? "no" : "yes"}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            handleToggleStocktake(row, event.target.value === "yes")
                          }
                          disabled={readOnly || saving}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => handleDelete(row)}
                          disabled={readOnly || deleteKey === `${row.outlet_id ?? "_"}-${row.warehouse_id ?? "_"}`}
                        >
                          {deleteKey === `${row.outlet_id ?? "_"}-${row.warehouse_id ?? "_"}` ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
