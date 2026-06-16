"use client";

import { useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "../enterprise.module.css";

type OutletRow = { id: string; name: string; code?: string | null };

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

export default function OutletLiveBalancesPage() {
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [outletBalances, setOutletBalances] = useState<OutletBalanceRow[]>([]);
  const [warehouseBalances, setWarehouseBalances] = useState<WarehouseBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      const { data, error } = await supabase
        .from("outlets")
        .select("id,name,code")
        .eq("active", true)
        .order("name");
      if (!active || error) return;
      const rows = (data as OutletRow[]) ?? [];
      setOutlets(rows);
      setSelectedOutletId((current) => current || (rows[0]?.id ?? ""));
    };

    loadOutlets();
    return () => {
      active = false;
    };
  }, [status, supabase]);

  useEffect(() => {
    if (status !== "ok" || !selectedOutletId) return;
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
  }, [status, supabase, selectedOutletId, outlets]);

  const warehousesForOutlet = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of warehouseBalances) {
      map.set(row.warehouse_id, row.warehouse_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [warehouseBalances]);

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  if (status !== "ok") return null;

  return (
    <div>
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Outlet live balances
          </h3>
          <p className={styles.pageCardBody}>
            Order-approved stock at each outlet (sent / consumed / on hand) plus physical balances per outlet warehouse.
            Refreshes every 30 seconds.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {outlets.map((outlet) => (
            <button
              key={outlet.id}
              type="button"
              className={outlet.id === selectedOutletId ? styles.btnPrimary : styles.btnGold}
              onClick={() => setSelectedOutletId(outlet.id)}
            >
              {outlet.name}
            </button>
          ))}
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
          <p className={styles.pageCardBody}>
            Increases when supervisors approve orders; decreases when POS sales match programmed deduction rules.
          </p>
        </div>
        {loading && outletBalances.length === 0 ? (
          <p className={styles.pageCardBody}>Loading…</p>
        ) : outletBalances.length === 0 ? (
          <p className={styles.pageCardBody}>No outlet stock balances yet for this outlet.</p>
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
              <p className={styles.pageCardBody}>Physical ledger balance at this outlet warehouse.</p>
            </div>
            {rows.length === 0 ? (
              <p className={styles.pageCardBody}>No ledger movements yet.</p>
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
