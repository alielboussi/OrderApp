"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "../reports/reports.module.css";
import { buildVehicleReportPdfHtml } from "./vehiclepdf";

type VehicleRow = {
  id: string;
  name: string | null;
  number_plate: string | null;
  driver_name: string | null;
  warehouse_id: string | null;
  active?: boolean | null;
};

type LedgerRow = {
  item_id: string | null;
  variant_key: string | null;
  delta_units: number | null;
  warehouse_id: string | null;
};

type CatalogItemRow = {
  id: string;
  name: string | null;
  item_kind: string | null;
};

type CatalogVariantRow = {
  id: string;
  item_id: string;
  name: string | null;
};

type ReportRow = {
  vehicle_id: string;
  vehicle_name: string;
  number_plate: string;
  driver_name: string;
  item_id: string;
  item_name: string;
  variant_key: string;
  variant_label: string;
  total_units: number;
};

type WhoAmIRoles = {
  outlets: Array<{ outlet_id: string; outlet_name: string }> | null;
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

function toDateInputValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function normalizeVariantKey(value?: string | null): string {
  const raw = value?.trim().toLowerCase() ?? "";
  return raw.length ? raw : "base";
}

function makeKey(itemId: string, variantKey?: string | null): string {
  return `${itemId}|${normalizeVariantKey(variantKey)}`.toLowerCase();
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatVariantLabel(value: string): string {
  return value === "base" ? "Base" : value;
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  try {
    const candidates = ["/afterten-logo.png", "/afterten_logo.png"];
    let blob: Blob | null = null;
    for (const path of candidates) {
      const response = await fetch(path, { cache: "force-cache" });
      if (response.ok) {
        blob = await response.blob();
        break;
      }
    }
    if (!blob) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export default function VehicleReportsPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [outletIds, setOutletIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("all");
  const [driverSearch, setDriverSearch] = useState("");
  const [plateSearch, setPlateSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue(lastWeek));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [outletsLoading, setOutletsLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);

  const booting = outletsLoading || vehiclesLoading;

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const eligibleVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const isActive = vehicle.active ?? true;
      if (!isActive || !vehicle.warehouse_id) return false;
      if (warehouseIds.length === 0) return true;
      return warehouseIds.includes(vehicle.warehouse_id);
    });
  }, [vehicles, warehouseIds]);

  const sortedVehicles = useMemo(() => {
    return [...eligibleVehicles].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [eligibleVehicles]);

  useEffect(() => {
    if (selectedVehicleId === "all") return;
    if (sortedVehicles.some((vehicle) => vehicle.id === selectedVehicleId)) return;
    setSelectedVehicleId("all");
  }, [selectedVehicleId, sortedVehicles]);

  const selectedVehicleLabel = useMemo(() => {
    if (selectedVehicleId === "all") return "All vehicles";
    const match = sortedVehicles.find((vehicle) => vehicle.id === selectedVehicleId);
    if (!match) return "Selected vehicle";
    return match.name ?? match.number_plate ?? match.id;
  }, [selectedVehicleId, sortedVehicles]);

  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "All dates";
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Through ${endDate}`;
  }, [startDate, endDate]);

  const totalUnits = useMemo(() => rows.reduce((sum, row) => sum + row.total_units, 0), [rows]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      try {
        setOutletsLoading(true);
        setError(null);

        const { data: whoami, error: whoamiError } = await supabase.rpc("whoami_roles");
        if (whoamiError) throw whoamiError;

        const record = (whoami?.[0] ?? null) as WhoAmIRoles | null;
        const outletList = record?.outlets ?? [];
        const mapped = outletList
          .map((outlet) => outlet?.outlet_id)
          .filter((outletId): outletId is string => Boolean(outletId));

        if (mapped.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as { outlet_id: string; outlet_name: string } | undefined;
          if (fallbackOutlet?.outlet_id) {
            mapped.push(fallbackOutlet.outlet_id);
          }
        }

        if (!active) return;
        setOutletIds(mapped);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setOutletIds([]);
      } finally {
        if (active) setOutletsLoading(false);
      }
    };

    loadOutlets();

    return () => {
      active = false;
    };
  }, [status, supabase]);

  useEffect(() => {
    if (status !== "ok") return;
    if (outletIds.length === 0) {
      setWarehouseIds([]);
      return;
    }

    let active = true;
    const loadWarehouses = async () => {
      try {
        setError(null);

        const { data: outletWarehouseRows, error: outletWarehouseError } = await supabase
          .from("outlet_warehouses")
          .select("warehouse_id")
          .in("outlet_id", outletIds)
          .eq("show_in_stocktake", true);

        if (outletWarehouseError) throw outletWarehouseError;

        const ids = Array.from(
          new Set((outletWarehouseRows ?? []).map((row) => row?.warehouse_id).filter(Boolean))
        ) as string[];

        if (!active) return;
        setWarehouseIds(ids);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setWarehouseIds([]);
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, supabase, outletIds]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadVehicles = async () => {
      try {
        setVehiclesLoading(true);
        setError(null);

        const { data, error: vehiclesError } = await supabase
          .from("vehicles")
          .select("id,name,number_plate,driver_name,warehouse_id,active")
          .order("name", { ascending: true });

        if (vehiclesError) throw vehiclesError;
        if (!active) return;
        setVehicles((data ?? []) as VehicleRow[]);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setVehicles([]);
      } finally {
        if (active) setVehiclesLoading(false);
      }
    };

    loadVehicles();

    return () => {
      active = false;
    };
  }, [status, supabase]);

  const runReport = useCallback(async () => {
    if (status !== "ok") return;

    try {
      setLoading(true);
      setError(null);

      const driverTerm = driverSearch.trim().toLowerCase();
      const plateTerm = plateSearch.trim().toLowerCase();
      const searchTerm = productSearch.trim().toLowerCase();

      const filteredVehicles = eligibleVehicles.filter((vehicle) => {
        if (selectedVehicleId !== "all" && vehicle.id !== selectedVehicleId) return false;
        if (driverTerm && !(vehicle.driver_name ?? "").toLowerCase().includes(driverTerm)) return false;
        if (plateTerm && !(vehicle.number_plate ?? "").toLowerCase().includes(plateTerm)) return false;
        return true;
      });

      if (filteredVehicles.length === 0) {
        setRows([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      const vehicleWarehouseIds = Array.from(
        new Set(filteredVehicles.map((vehicle) => vehicle.warehouse_id).filter(Boolean))
      ) as string[];

      if (vehicleWarehouseIds.length === 0) {
        setRows([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      let ledgerQuery = supabase
        .from("stock_ledger")
        .select("item_id,variant_key,delta_units,warehouse_id")
        .eq("location_type", "warehouse")
        .eq("reason", "warehouse_transfer")
        .gt("delta_units", 0)
        .in("warehouse_id", vehicleWarehouseIds);

      if (startDate) {
        const startIso = new Date(`${startDate}T00:00:00`).toISOString();
        ledgerQuery = ledgerQuery.gte("occurred_at", startIso);
      }

      if (endDate) {
        const end = new Date(`${endDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        ledgerQuery = ledgerQuery.lt("occurred_at", end.toISOString());
      }

      const { data: ledgerRows, error: ledgerError } = await ledgerQuery;
      if (ledgerError) throw ledgerError;

      const ledger = (ledgerRows ?? []) as LedgerRow[];
      const itemIds = Array.from(new Set(ledger.map((row) => row.item_id).filter(Boolean))) as string[];

      if (!itemIds.length) {
        setRows([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      const [itemsResponse, variantsResponse] = await Promise.all([
        supabase.from("catalog_items").select("id,name,item_kind").in("id", itemIds),
        supabase.from("catalog_variants").select("id,item_id,name").in("item_id", itemIds),
      ]);

      if (itemsResponse.error) throw itemsResponse.error;
      if (variantsResponse.error) throw variantsResponse.error;

      const itemMap = new Map<string, CatalogItemRow>();
      (itemsResponse.data ?? []).forEach((item) => itemMap.set(item.id, item as CatalogItemRow));

      const variantLabelMap = new Map<string, string>();
      (variantsResponse.data ?? []).forEach((variant) => {
        const row = variant as CatalogVariantRow;
        const label = row.name?.trim();
        if (!label) return;
        variantLabelMap.set(makeKey(row.item_id, row.id), label);
      });

      const vehicleByWarehouse = new Map<string, VehicleRow>();
      filteredVehicles.forEach((vehicle) => {
        if (vehicle.warehouse_id) vehicleByWarehouse.set(vehicle.warehouse_id, vehicle);
      });

      const totals = new Map<string, number>();
      const detail = new Map<string, { vehicle: VehicleRow; itemId: string; variantKey: string }>();

      ledger.forEach((row) => {
        if (!row?.item_id || !row.warehouse_id) return;
        const vehicle = vehicleByWarehouse.get(row.warehouse_id);
        if (!vehicle) return;
        const variantKey = normalizeVariantKey(row.variant_key);
        const key = `${vehicle.id}|${row.item_id}|${variantKey}`.toLowerCase();
        const delta = Number(row.delta_units ?? 0);
        if (!Number.isFinite(delta) || delta <= 0) return;
        totals.set(key, (totals.get(key) ?? 0) + delta);
        if (!detail.has(key)) detail.set(key, { vehicle, itemId: row.item_id, variantKey });
      });

      let nextRows: ReportRow[] = Array.from(detail.entries()).map(([key, meta]) => {
        const vehicle = meta.vehicle;
        const item = itemMap.get(meta.itemId);
        const variantLabel =
          variantLabelMap.get(makeKey(meta.itemId, meta.variantKey)) ?? formatVariantLabel(meta.variantKey);

        return {
          vehicle_id: vehicle.id,
          vehicle_name: vehicle.name ?? "Vehicle",
          number_plate: vehicle.number_plate ?? "",
          driver_name: vehicle.driver_name ?? "",
          item_id: meta.itemId,
          item_name: item?.name ?? "Item",
          variant_key: meta.variantKey,
          variant_label: variantLabel,
          total_units: totals.get(key) ?? 0,
        };
      });

      if (searchTerm) {
        nextRows = nextRows.filter((row) => {
          const haystack = `${row.item_name} ${row.variant_label} ${row.vehicle_name}`.toLowerCase();
          return haystack.includes(searchTerm);
        });
      }

      nextRows.sort(
        (a, b) =>
          a.vehicle_name.localeCompare(b.vehicle_name) ||
          a.item_name.localeCompare(b.item_name) ||
          a.variant_label.localeCompare(b.variant_label)
      );

      setRows(nextRows);
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    status,
    supabase,
    eligibleVehicles,
    selectedVehicleId,
    driverSearch,
    plateSearch,
    productSearch,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    if (status !== "ok" || hasAutoRun || eligibleVehicles.length === 0) return;
    setHasAutoRun(true);
    void runReport();
  }, [status, hasAutoRun, eligibleVehicles.length, runReport]);

  const downloadPdfReport = useCallback(async () => {
    if (rows.length === 0) return;
    const logoDataUrl = await loadLogoDataUrl();
    const html = buildVehicleReportPdfHtml({
      rangeText: rangeLabel,
      vehicleText: selectedVehicleLabel,
      driverText: driverSearch.trim() || "Any driver",
      plateText: plateSearch.trim() || "Any plate",
      logoDataUrl,
      rows: rows.map((row) => ({
        vehicle: row.vehicle_name,
        plate: row.number_plate || "-",
        driver: row.driver_name || "-",
        item_name: row.item_name,
        variant_label: row.variant_label,
        qty_units: row.total_units,
      })),
      totalQty: totalUnits,
    });

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const doc = frame.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      if (frame.parentNode) {
        frame.parentNode.removeChild(frame);
      }
    };

    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(cleanup, 1000);
    }, 400);
  }, [rows, rangeLabel, selectedVehicleLabel, driverSearch, plateSearch, totalUnits]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Vehicle Reports</h1>
            <p className={styles.subtitle}>
              Track product quantities sent to vehicles by date, driver, and number plate.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={handleBack} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.filtersGrid}>
          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Vehicle</h2>
            </div>
            <label className={styles.inputLabel}>
              Select vehicle
              <select
                className={styles.textInput}
                value={selectedVehicleId}
                onChange={(event) => setSelectedVehicleId(event.target.value)}
                disabled={booting || sortedVehicles.length === 0}
              >
                <option value="all">All vehicles</option>
                {sortedVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name ?? vehicle.number_plate ?? vehicle.id}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.smallNote}>
              {sortedVehicles.length === 0
                ? "No vehicles available for the linked warehouses."
                : `Vehicles available: ${sortedVehicles.length.toLocaleString()}.`}
            </p>
          </div>

          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Date range</h2>
            </div>
            <label className={styles.inputLabel}>
              Start date
              <input
                type="date"
                className={styles.textInput}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className={styles.inputLabel}>
              End date
              <input
                type="date"
                className={styles.textInput}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <p className={styles.smallNote}>Totals include transfers on every day in the range.</p>
          </div>

          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Filters</h2>
            </div>
            <label className={styles.inputLabel}>
              Driver name
              <input
                className={styles.textInput}
                placeholder="Search driver"
                value={driverSearch}
                onChange={(event) => setDriverSearch(event.target.value)}
              />
            </label>
            <label className={styles.inputLabel}>
              Number plate
              <input
                className={styles.textInput}
                placeholder="Search number plate"
                value={plateSearch}
                onChange={(event) => setPlateSearch(event.target.value)}
              />
            </label>
            <label className={styles.inputLabel}>
              Product search
              <input
                className={styles.textInput}
                placeholder="Search products"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
              />
            </label>
            <div className={styles.actionsRow}>
              <button
                className={styles.primaryButton}
                onClick={runReport}
                disabled={loading || booting || sortedVehicles.length === 0}
              >
                {loading ? "Loading..." : "Run report"}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setDriverSearch("");
                  setPlateSearch("");
                  setProductSearch("");
                  setSelectedVehicleId("all");
                }}
                disabled={loading}
              >
                Reset filters
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => void downloadPdfReport()}
                disabled={loading || rows.length === 0}
              >
                Download PDF
              </button>
            </div>
            {reportAt && <p className={styles.smallNote}>Last updated {reportAt}</p>}
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Vehicle filter</p>
            <p className={styles.summaryValue}>{selectedVehicleLabel}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Products</p>
            <p className={styles.summaryValue}>{rows.length}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total qty sent</p>
            <p className={styles.summaryValue}>{formatQty(totalUnits)}</p>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.tableTitle}>Vehicle transfer totals</h2>
              <p className={styles.tableNote}>
                {rangeLabel} · {selectedVehicleLabel}
              </p>
            </div>
            <p className={styles.tableNote}>{rows.length} rows</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>Driver</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className={styles.rightAlign}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      Loading report...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      No vehicle transfers matched this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={`${row.vehicle_id}-${row.item_id}-${row.variant_key}`}>
                      <td>{row.vehicle_name}</td>
                      <td>{row.number_plate || "-"}</td>
                      <td>{row.driver_name || "-"}</td>
                      <td>{row.item_name}</td>
                      <td>{row.variant_label}</td>
                      <td className={styles.rightAlign}>{formatQty(row.total_units)}</td>
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
