"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./stock-reports.module.css";

type OutletOption = { id: string; name: string };

type WarehouseOption = { id: string; name: string | null; code: string | null; active?: boolean | null };

type StockPeriod = {
  id: string;
  warehouse_id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  note: string | null;
  stocktake_number: string | null;
};

type WhoAmIRoles = { outlets: Array<{ outlet_id: string; outlet_name: string }> | null };

function formatStamp(raw?: string | null): string {
  if (!raw) return "—";
  const trimmed = raw.replace("T", " ");
  return trimmed.length > 19 ? trimmed.slice(0, 19) : trimmed;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export default function StockReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [linkedWarehouseIds, setLinkedWarehouseIds] = useState<string[]>([]);
  const [periods, setPeriods] = useState<StockPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      try {
        setError(null);
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id ?? null;
        if (!currentUserId) throw new Error("No user session found");

        const { data: whoami, error: whoamiError } = await supabase.rpc("whoami_roles");
        if (whoamiError) throw whoamiError;

        const mapped: OutletOption[] = [];
        const record = (whoami?.[0] ?? null) as WhoAmIRoles | null;
        const outletList = record?.outlets ?? [];
        mapped.push(
          ...outletList
            .filter((outlet) => outlet?.outlet_id)
            .map((outlet) => ({ id: outlet.outlet_id, name: outlet.outlet_name }))
        );

        if (mapped.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as { outlet_id: string; outlet_name: string } | undefined;
          if (fallbackOutlet?.outlet_id) {
            mapped.push({ id: fallbackOutlet.outlet_id, name: fallbackOutlet.outlet_name });
          }
        }

        if (!active) return;

        setOutlets(mapped);
        if (selectedOutletIds.length === 0 && mapped.length > 0) {
          setSelectedOutletIds(mapped.map((outlet) => outlet.id));
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    loadOutlets();

    return () => {
      active = false;
    };
  }, [status, supabase, selectedOutletIds.length]);

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0) {
      setWarehouses([]);
      setLinkedWarehouseIds([]);
      setSelectedWarehouseId("");
      return;
    }
    let active = true;

    const loadWarehouses = async () => {
      try {
        setError(null);
        const { data: outletWarehouseRows, error: outletWarehouseError } = await supabase
          .from("outlet_warehouses")
          .select("warehouse_id")
          .in("outlet_id", selectedOutletIds)
          .eq("show_in_stocktake", true);

        if (outletWarehouseError) throw outletWarehouseError;
        const warehouseIds = Array.from(
          new Set((outletWarehouseRows ?? []).map((row) => row?.warehouse_id).filter(Boolean))
        ) as string[];

        setLinkedWarehouseIds(warehouseIds);
        if (warehouseIds.length === 0) {
          setWarehouses([]);
          setSelectedWarehouseId("");
          return;
        }

        const { data, error: warehouseError } = await supabase
          .from("warehouses")
          .select("id,name,code,active")
          .in("id", warehouseIds)
          .order("name", { ascending: true });

        if (warehouseError) throw warehouseError;
        if (!active) return;

        const filtered = (data || []).filter((row) => row.active ?? true) as WarehouseOption[];
        const withAll = [{ id: "all", name: "All linked warehouses", code: null }, ...filtered];
        setWarehouses(withAll);
        const isValidSelection = selectedWarehouseId && withAll.some((warehouse) => warehouse.id === selectedWarehouseId);
        if (!isValidSelection && withAll.length > 0) {
          setSelectedWarehouseId(withAll[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load warehouses");
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds, selectedWarehouseId, supabase]);

  useEffect(() => {
    if (status !== "ok" || !selectedWarehouseId) return;
    let active = true;

    const loadPeriods = async () => {
      try {
        setLoading(true);
        setError(null);

        const warehouseIds = selectedWarehouseId === "all" ? linkedWarehouseIds : [selectedWarehouseId];
        if (!warehouseIds.length) {
          if (active) setPeriods([]);
          return;
        }

        const { data, error: periodError } = await supabase
          .from("warehouse_stock_periods")
          .select("id,warehouse_id,status,opened_at,closed_at,note,stocktake_number")
          .in("warehouse_id", warehouseIds)
          .order("opened_at", { ascending: false });

        if (periodError) throw periodError;
        if (!active) return;
        setPeriods((data as StockPeriod[]) || []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load periods");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPeriods();

    return () => {
      active = false;
    };
  }, [status, selectedWarehouseId, linkedWarehouseIds, supabase]);

  const openPeriods = periods.filter((period) => period.status?.toLowerCase() === "open");
  const closedPeriods = periods.filter((period) => period.status?.toLowerCase() !== "open");

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Stock Reports</h1>
            <p className={styles.subtitle}>Review stocktake periods for mapped warehouses.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>Back</button>
            <button onClick={handleBack} className={styles.backButton}>Back to Dashboard</button>
          </div>
        </header>

        <section className={styles.filtersCard}>
          <div className={styles.filterRow}>
            <div className={styles.filterLabel}>
              Outlet
              <div className={styles.outletList}>
                {outlets.length === 0 ? (
                  <span className={styles.emptyNote}>No outlets found</span>
                ) : (
                  outlets.map((outlet) => (
                    <label key={outlet.id} className={styles.outletRow}>
                      <input
                        type="checkbox"
                        checked={selectedOutletIds.includes(outlet.id)}
                        onChange={() => {
                          setSelectedOutletIds((prev) =>
                            prev.includes(outlet.id) ? prev.filter((value) => value !== outlet.id) : [...prev, outlet.id]
                          );
                          setSelectedWarehouseId("");
                        }}
                      />
                      <span>{outlet.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <label className={styles.filterLabel}>
              Warehouse
              <select
                className={styles.select}
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
                disabled={selectedOutletIds.length === 0}
              >
                {warehouses.length === 0 ? (
                  <option value="">No warehouses found</option>
                ) : (
                  warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name || warehouse.code || warehouse.id}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </section>

        {error && <p className={styles.errorBanner}>{error}</p>}

        <section className={styles.cardsSection}>
          {loading && <p className={styles.loadingTag}>Refreshing…</p>}

          {openPeriods.length > 0 && (
            <div>
              <h2 className={styles.sectionTitle}>Open periods</h2>
              <div className={styles.cardsGrid}>
                {openPeriods.map((period) => (
                  <article key={period.id} className={styles.card}>
                    <h3 className={styles.cardTitle}>{period.stocktake_number || period.id.slice(0, 8)}</h3>
                    <p className={styles.cardMeta}>Status: {period.status}</p>
                    <p className={styles.cardMeta}>Opened: {formatStamp(period.opened_at)}</p>
                    <p className={styles.cardMeta}>Closed: {formatStamp(period.closed_at)}</p>
                    {period.note ? <p className={styles.cardNote}>Note: {period.note}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          )}

          {closedPeriods.length > 0 && (
            <div>
              <h2 className={styles.sectionTitle}>Closed periods</h2>
              <div className={styles.cardsGrid}>
                {closedPeriods.map((period) => (
                  <article key={period.id} className={styles.card}>
                    <h3 className={styles.cardTitle}>{period.stocktake_number || period.id.slice(0, 8)}</h3>
                    <p className={styles.cardMeta}>Status: {period.status}</p>
                    <p className={styles.cardMeta}>Opened: {formatStamp(period.opened_at)}</p>
                    <p className={styles.cardMeta}>Closed: {formatStamp(period.closed_at)}</p>
                    {period.note ? <p className={styles.cardNote}>Note: {period.note}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          )}

          {!loading && periods.length === 0 && (
            <p className={styles.emptyState}>No stocktake periods found for the current filters.</p>
          )}
        </section>
      </main>
    </div>
  );
}
