"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./outlet-warehouses.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

type Outlet = { id: string; name: string; code?: string | null; active?: boolean | null };
type Warehouse = { id: string; name: string; code?: string | null; active?: boolean | null };

type MappingRow = {
  outlet_id: string;
  warehouse_id: string;
  outlet: Outlet;
  warehouse: Warehouse;
};

type AlertState = { variant: "success" | "error"; message: string } | null;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value.trim());

const normalizeOutlet = (outlet?: Partial<Outlet> | null): Outlet => ({
  id: outlet?.id ?? "",
  name: (outlet?.name ?? "Outlet").trim(),
  code: outlet?.code ?? null,
  active: outlet?.active ?? true,
});

const normalizeWarehouse = (warehouse?: Partial<Warehouse> | null): Warehouse => ({
  id: warehouse?.id ?? "",
  name: (warehouse?.name ?? "Warehouse").trim(),
  code: warehouse?.code ?? null,
  active: warehouse?.active ?? true,
});

export default function OutletWarehousesPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [mutating, setMutating] = useState<boolean>(false);
  const [alert, setAlert] = useState<AlertState>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setAlert(null);
    try {
      const [outletsRes, warehousesRes, mappingsRes] = await Promise.all([
        fetch("/api/outlets"),
        fetch("/api/warehouses"),
        fetch("/api/outlet-warehouses"),
      ]);

      if (!outletsRes.ok) throw new Error("Failed to load outlets");
      if (!warehousesRes.ok) throw new Error("Failed to load warehouses");
      if (!mappingsRes.ok) throw new Error("Failed to load mappings");

      const outletsJson = await outletsRes.json();
      const warehousesJson = await warehousesRes.json();
      const mappingsJson = await mappingsRes.json();

      const outletList = Array.isArray(outletsJson?.outlets) ? outletsJson.outlets : [];
      const warehouseList = Array.isArray(warehousesJson?.warehouses) ? warehousesJson.warehouses : [];
      type RawMapping = {
        outlet_id?: unknown;
        warehouse_id?: unknown;
        outlet?: Partial<Outlet> | null;
        warehouse?: Partial<Warehouse> | null;
      };

      const mappingsPayload: RawMapping[] = Array.isArray(mappingsJson?.mappings)
        ? mappingsJson.mappings
        : Array.isArray(mappingsJson)
        ? mappingsJson
        : [];

      setOutlets(outletList);
      setWarehouses(warehouseList);
      setRows(
        mappingsPayload
          .filter((entry) => isUuid(entry?.outlet_id) && isUuid(entry?.warehouse_id))
          .map((entry) => ({
            outlet_id: String(entry.outlet_id),
            warehouse_id: String(entry.warehouse_id),
            outlet: normalizeOutlet(entry.outlet),
            warehouse: normalizeWarehouse(entry.warehouse),
          }))
      );
    } catch (error) {
      console.error(error);
      setAlert({ variant: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") {
      fetchData();
    } else if (status !== "checking") {
      setLoading(false);
    }
  }, [status, fetchData]);

  const resetForm = () => {
    setSelectedOutlet("");
    setSelectedWarehouse("");
  };

  const handleAdd = async () => {
    if (!selectedOutlet || !selectedWarehouse) return;
    if (rows.some((row) => row.outlet_id === selectedOutlet && row.warehouse_id === selectedWarehouse)) {
      setAlert({ variant: "error", message: "Mapping already exists." });
      return;
    }

    setMutating(true);
    setAlert(null);
    try {
      const res = await fetch("/api/outlet-warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: selectedOutlet, warehouse_id: selectedWarehouse }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create mapping");
      }
      resetForm();
      await fetchData();
      setAlert({ variant: "success", message: "Mapping added." });
    } catch (error) {
      console.error(error);
      setAlert({ variant: "error", message: (error as Error).message });
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async (outletId: string, warehouseId: string) => {
    setMutating(true);
    setAlert(null);
    try {
      const params = new URLSearchParams({ outlet_id: outletId, warehouse_id: warehouseId });
      const res = await fetch(`/api/outlet-warehouses?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete mapping");
      }
      await fetchData();
      setAlert({ variant: "success", message: "Mapping removed." });
    } catch (error) {
      console.error(error);
      setAlert({ variant: "error", message: (error as Error).message });
    } finally {
      setMutating(false);
    }
  };

  const outletOptions = useMemo(
    () => outlets.map((o) => ({ value: o.id, label: `${o.name}${o.code ? ` (${o.code})` : ""}` })),
    [outlets]
  );
  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: w.id, label: `${w.name}${w.code ? ` (${w.code})` : ""}` })),
    [warehouses]
  );

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Warehouse Backoffice</p>
            <h1 className={styles.title}>Outlet ↔ Warehouse mappings</h1>
            <p className={styles.subtitle}>
              Link outlets to the warehouses they are allowed to stocktake from. Existing mappings load from Supabase and
              can be added or removed here.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>
              Back to dashboard
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.controlsRow}>
            <select
              className={styles.select}
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
              disabled={loading || mutating}
              aria-label="Select outlet"
            >
              <option value="">Select outlet…</option>
              {outletOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              disabled={loading || mutating}
              aria-label="Select warehouse"
            >
              <option value="">Select warehouse…</option>
              {warehouseOptions.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>

            <div className={styles.actions}>
              <button className={styles.secondaryButton} onClick={resetForm} disabled={loading || mutating}>
                Clear
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleAdd}
                disabled={loading || mutating || !selectedOutlet || !selectedWarehouse}
              >
                Add mapping
              </button>
            </div>
          </div>

          {alert && (
            <div className={`${styles.callout} ${alert.variant === "success" ? styles.calloutSuccess : styles.calloutError}`}>
              {alert.message}
            </div>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.routesTable}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Warehouse</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3}>Loading…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No mappings yet.</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const key = `${row.outlet_id}-${row.warehouse_id}`;
                    return (
                      <tr key={key}>
                        <td>
                          <div className={styles.outletName}>{row.outlet.name}</div>
                          {row.outlet.code ? <div className={styles.outletCode}>{row.outlet.code}</div> : null}
                          {row.outlet.active === false ? <div className={styles.outletInactive}>Inactive</div> : null}
                        </td>
                        <td>
                          <div className={styles.outletName}>{row.warehouse.name}</div>
                          {row.warehouse.code ? <div className={styles.outletCode}>{row.warehouse.code}</div> : null}
                          {row.warehouse.active === false ? <div className={styles.outletInactive}>Inactive</div> : null}
                        </td>
                        <td>
                          <button
                            className={styles.secondaryButton}
                            onClick={() => handleDelete(row.outlet_id, row.warehouse_id)}
                            disabled={mutating || loading}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
