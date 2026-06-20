"use client";

import { useEffect, useMemo, useState } from "react";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { fetchSellingOutlets, type SellingOutlet } from "@/lib/sellingOutlets";
import { isStoreroomLabel } from "@/lib/outletScope";
import styles from "./enterprise.module.css";

type OutletBalanceRow = {
  outlet_id: string;
  outlet_name: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  variant_key: string;
  sent_units: number;
  consumed_units: number;
  on_hand_units: number;
  updated_at: string | null;
};

type WarehouseBalanceRow = {
  outlet_id: string;
  warehouse_id: string;
  warehouse_name: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  variant_key: string;
  net_units: number;
};

const POLL_MS = 30_000;

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

type OutletLiveBalancesPanelProps = {
  enabled?: boolean;
};

export default function OutletLiveBalancesPanel({ enabled = true }: OutletLiveBalancesPanelProps) {
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [outlets, setOutlets] = useState<SellingOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [outletBalances, setOutletBalances] = useState<OutletBalanceRow[]>([]);
  const [warehouseBalances, setWarehouseBalances] = useState<WarehouseBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchSellingOutlets()
      .then((rows) => {
        if (!active) return;
        setOutlets(rows);
      })
      .catch(() => {
        if (active) setOutlets([]);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!selectedOutletId) {
      setOutletBalances([]);
      setWarehouseBalances([]);
      setLoading(false);
      return;
    }
    let active = true;

    const loadBalances = async () => {
      setLoading(true);
      try {
        const [obRes, wbRes] = await Promise.all([
          supabase
            .from("v_outlet_live_balances")
            .select("*")
            .eq("outlet_id", selectedOutletId)
            .order("item_name"),
          supabase
            .from("v_outlet_warehouse_ledger_balances")
            .select("*")
            .eq("outlet_id", selectedOutletId)
            .order("warehouse_name"),
        ]);

        if (!active) return;

        let outletRows = (obRes.data as OutletBalanceRow[]) ?? [];
        let warehouseRows = (wbRes.data as WarehouseBalanceRow[]) ?? [];

        if (obRes.error) {
          const fallback = await supabase
            .from("outlet_stock_summary")
            .select("outlet_id,item_id,item_name,variant_key,sent_units,consumed_units,on_hand_units")
            .eq("outlet_id", selectedOutletId)
            .order("item_name");
          if (!fallback.error && fallback.data) {
            const outletName = outlets.find((o) => o.id === selectedOutletId)?.name ?? "";
            outletRows = (fallback.data as OutletBalanceRow[]).map((r) => ({
              ...r,
              outlet_name: outletName,
              item_sku: null,
              updated_at: null,
            }));
          }
        }

        setOutletBalances(outletRows);
        setWarehouseBalances(warehouseRows);
        setLastRefreshed(new Date().toISOString());
      } catch {
        if (active) {
          setOutletBalances([]);
          setWarehouseBalances([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBalances();
    const timer = window.setInterval(loadBalances, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, supabase, selectedOutletId, outlets]);

  const warehousesForOutlet = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of warehouseBalances) {
      if (isStoreroomLabel(row.warehouse_name)) continue;
      map.set(row.warehouse_id, row.warehouse_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [warehouseBalances]);

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  if (!enabled) return null;

  return (
    <div id="outlet-live-balances">
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Outlet live balances
          </h3>
        </div>
        <div style={{ marginTop: 12, maxWidth: 360 }}>
          {outlets.length === 0 ? (
            <p className={styles.pageCardBody}>No outlets</p>
          ) : (
            <select
              className={styles.fieldSelect}
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              aria-label="Select outlet"
            >
              <option value="">Select-Outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {lastRefreshed && (
          <p className={styles.pageCardBody} style={{ marginTop: 8, fontSize: 12 }}>
            Last refreshed: {new Date(lastRefreshed).toLocaleString()}
            {selectedOutlet ? ` · ${selectedOutlet.name}` : ""}
          </p>
        )}
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGreen}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Order stock at outlet
          </h3>
        </div>
        {loading && outletBalances.length === 0 ? (
          <p className={styles.pageCardBody}>Loading...</p>
        ) : outletBalances.length === 0 ? (
          <p className={styles.pageCardBody}>No records</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th>Variant</th>
                  <th>Sent (orders)</th>
                  <th>Consumed (sales)</th>
                  <th>On hand</th>
                </tr>
              </thead>
              <tbody>
                {outletBalances.map((row) => (
                  <tr key={`${row.item_id}-${row.variant_key}`}>
                    <td>{row.item_name}</td>
                    <td>{row.item_sku ?? "—"}</td>
                    <td>{row.variant_key}</td>
                    <td>{formatQty(Number(row.sent_units))}</td>
                    <td>{formatQty(Number(row.consumed_units))}</td>
                    <td>
                      <strong>{formatQty(Number(row.on_hand_units))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {warehousesForOutlet.map((wh) => {
        const rows = warehouseBalances.filter((r) => r.warehouse_id === wh.id);
        return (
          <section key={wh.id} className={styles.pageCard}>
            <div className={styles.sectionHeaderGold}>
              <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
                {wh.name}
              </h3>
            </div>
            {rows.length === 0 ? (
              <p className={styles.pageCardBody}>No records</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th>Variant</th>
                      <th>Net units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.warehouse_id}-${row.item_id}-${row.variant_key}`}>
                        <td>{row.item_name}</td>
                        <td>{row.item_sku ?? "—"}</td>
                        <td>{row.variant_key}</td>
                        <td>
                          <strong>{formatQty(Number(row.net_units))}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
