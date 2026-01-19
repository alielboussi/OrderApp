"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./outlet-routing.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

type Outlet = { id: string; name: string; code?: string | null; active?: boolean };
type Warehouse = { id: string; name: string };
type Item = { id: string; name: string; item_kind?: string };

type RouteRecord = Record<string, string>;

const variantKey = "base";

export default function OutletRoutingPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [routes, setRoutes] = useState<RouteRecord>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const warehouseOptions = useMemo(() => [{ id: "", name: "Not set" }, ...warehouses], [warehouses]);
  const itemOptions = useMemo(() => [{ id: "", name: "Select product" }, ...items], [items]);

  useEffect(() => {
    if (status !== "ok") return;
    async function loadBasics() {
      setLoading(true);
      setMessage(null);
      try {
        const [outletRes, warehouseRes, itemRes] = await Promise.all([
          fetch("/api/outlets"),
          fetch("/api/warehouses"),
          fetch("/api/catalog/items"),
        ]);

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
          const list = Array.isArray(json.items) ? json.items : [];
          // Hide ingredient-only items; keep finished/raw or anything without a kind value.
          setItems(list.filter((it: Item) => (it.item_kind ?? "finished") !== "ingredient"));
        }
      } catch (error) {
        console.error("outlet routing preload failed", error);
        setMessage({ ok: false, text: "Failed to load outlets or warehouses" });
      } finally {
        setLoading(false);
      }
    }
    loadBasics();
  }, [status]);

  useEffect(() => {
    if (!selectedItemId) {
      setRoutes({});
      return;
    }
    async function loadRoutes() {
      setLoading(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/outlet-routes?item_id=${selectedItemId}&variant_key=${variantKey}`);
        if (!res.ok) throw new Error("Could not load routes");
        const json = await res.json();
        const routeMap: RouteRecord = {};
        (Array.isArray(json.routes) ? json.routes : []).forEach((route: { outlet_id?: string; warehouse_id?: string | null }) => {
          if (route.outlet_id) {
            routeMap[route.outlet_id] = route.warehouse_id ?? "";
          }
        });
        setRoutes(routeMap);
      } catch (error) {
        console.error("outlet routes load failed", error);
        setMessage({ ok: false, text: "Unable to load outlet routes" });
      } finally {
        setLoading(false);
      }
    }
    loadRoutes();
  }, [selectedItemId]);

  if (status !== "ok") return null;

  const back = () => router.push("/Warehouse_Backoffice");
  const backOne = () => router.back();

  const setRoute = (outletId: string, warehouseId: string) => {
    setRoutes((prev) => ({ ...prev, [outletId]: warehouseId }));
  };

  const save = async () => {
    if (!selectedItemId) {
      setMessage({ ok: false, text: "Choose a product first" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        item_id: selectedItemId,
        variant_key: variantKey,
        routes: outlets.map((outlet) => ({ outlet_id: outlet.id, warehouse_id: routes[outlet.id] || null })),
      };

      const res = await fetch("/api/outlet-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save routes");
      }

      setMessage({ ok: true, text: "Routes saved" });
    } catch (error) {
      console.error(error);
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Routing</p>
            <h1 className={styles.title}>Warehouse Assign</h1>
            <p className={styles.subtitle}>
              Pick a product, then assign which warehouse each outlet should deduct from when orders are allocated.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={backOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={back} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.controlsRow}>
            <label className={styles.field}>
              <span className={styles.label}>Product</span>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className={styles.select}
                disabled={loading}
              >
                {itemOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setRoutes({})} disabled={loading || !selectedItemId}>
                Clear routes
              </button>
              <button type="button" className={styles.primaryButton} onClick={save} disabled={saving || loading || !selectedItemId}>
                {saving ? "Saving..." : "Save mappings"}
              </button>
            </div>
          </div>

          {message && (
            <div className={`${styles.callout} ${message.ok ? styles.calloutSuccess : styles.calloutError}`}>
              {message.text}
            </div>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.routesTable}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((outlet) => (
                  <tr key={outlet.id}>
                    <td>
                      <div className={styles.outletName}>{outlet.name}</div>
                      {outlet.code && <div className={styles.outletCode}>{outlet.code}</div>}
                      {!outlet.active && <div className={styles.outletInactive}>Inactive</div>}
                    </td>
                    <td>
                      <select
                        value={routes[outlet.id] ?? ""}
                        onChange={(e) => setRoute(outlet.id, e.target.value)}
                        className={styles.select}
                        disabled={loading || !selectedItemId}
                        aria-label={`Warehouse for outlet ${outlet.name}`}
                      >
                        {warehouseOptions.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
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
button { background: none; border: none; }
button:hover { transform: translateY(-1px); }
input, select, button { font-family: inherit; }
`;
