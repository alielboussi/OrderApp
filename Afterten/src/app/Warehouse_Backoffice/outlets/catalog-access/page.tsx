"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";

type Outlet = { id: string; name: string; auth_user_id?: string | null };
type CatalogVariant = {
  id: string;
  item_id: string;
  name: string;
  sku?: string | null;
  allow_orders: boolean;
};
type CatalogItem = {
  id: string;
  name: string;
  sku?: string | null;
  has_variations?: boolean;
  allow_orders: boolean;
  variants: CatalogVariant[];
};

export default function OutletCatalogAccessPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadOutlets = useCallback(async () => {
    const res = await fetch("/api/outlet-catalog-access");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unable to load outlets");
    setOutlets(Array.isArray(json.outlets) ? json.outlets : []);
  }, []);

  const loadCatalog = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/outlet-catalog-access?outlet_id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load catalog access");
      setCatalog(Array.isArray(json.catalog) ? json.catalog : []);
      const authId =
        json.auth_assignments?.[0]?.auth_user_id ??
        json.legacy_auth_user_id ??
        json.outlet?.auth_user_id ??
        "";
      setAuthUserId(authId || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") void loadOutlets();
  }, [status, loadOutlets]);

  useEffect(() => {
    if (outletId) void loadCatalog(outletId);
  }, [outletId, loadCatalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? "").toLowerCase().includes(q) ||
        item.variants.some((v) => v.name.toLowerCase().includes(q))
    );
  }, [catalog, search]);

  const toggleItem = (itemId: string, value: boolean) => {
    setCatalog((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, allow_orders: value };
      })
    );
  };

  const toggleVariant = (itemId: string, variantId: string, value: boolean) => {
    setCatalog((prev) =>
      prev.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              variants: item.variants.map((variant) =>
                variant.id === variantId ? { ...variant, allow_orders: value } : variant
              ),
            }
      )
    );
  };

  const save = async () => {
    if (!outletId || readOnly) return;
    setSaving(true);
    setMessage(null);
    try {
      const entries: Array<{
        item_id: string;
        variant_id?: string | null;
        allow_orders: boolean;
      }> = [];
      for (const item of catalog) {
        if (item.has_variations) {
          for (const variant of item.variants) {
            if (variant.allow_orders) {
              entries.push({
                item_id: item.id,
                variant_id: variant.id,
                allow_orders: variant.allow_orders,
              });
            }
          }
        } else if (item.allow_orders) {
          entries.push({
            item_id: item.id,
            variant_id: null,
            allow_orders: item.allow_orders,
          });
        }
      }
      const res = await fetch("/api/outlet-catalog-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          auth_user_id: authUserId.trim() || null,
          assignment_role: "orders",
          entries,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setCatalog(Array.isArray(json.catalog) ? json.catalog : []);
      setMessage("Outlet catalog access saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Outlet Catalog Access</h3>
        <p className={eb.pageCardBody}>
          Select an outlet, link its Supabase Auth user, and choose which products and variants appear in the
          Afterten Orders app for that outlet.
        </p>
      </section>

      <section className={eb.pageCard} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label className={eb.pageCardBody}>
          Outlet
          <select
            className={eb.fieldInput}
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            style={{ display: "block", marginTop: 6 }}
          >
            <option value="">Select outlet…</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </label>
        <label className={eb.pageCardBody}>
          Supabase Auth user ID
          <input
            className={eb.fieldInput}
            value={authUserId}
            onChange={(e) => setAuthUserId(e.target.value)}
            placeholder="UUID from Supabase Auth → Users"
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        <input
          className={eb.fieldInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
        />
      </section>

      {message ? <p className={eb.pageCardBody}>{message}</p> : null}

      {outletId ? (
        <section className={eb.pageCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
              Products & variants
            </h3>
            <button type="button" className={eb.btnAdd} disabled={saving || readOnly} onClick={() => void save()}>
              {saving ? "Saving…" : "Save access rules"}
            </button>
          </div>
          {loading ? <p className={eb.pageCardBody}>Loading…</p> : null}
          {!loading && filtered.length === 0 ? <p className={eb.pageCardBody}>No active products.</p> : null}
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {filtered.map((item) => (
              <div key={item.id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 13, color: "#57606a" }}>{item.sku ?? "—"}</div>
                {!item.has_variations ? (
                  <label style={{ display: "block", marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={item.allow_orders}
                      onChange={(e) => toggleItem(item.id, e.target.checked)}
                    />{" "}
                    Orders app
                  </label>
                ) : (
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {item.variants.map((variant) => (
                      <div key={variant.id} style={{ paddingLeft: 12, borderLeft: "3px solid #d4af37" }}>
                        <div>{variant.name}</div>
                        <label>
                          <input
                            type="checkbox"
                            checked={variant.allow_orders}
                            onChange={(e) => toggleVariant(item.id, variant.id, e.target.checked)}
                          />{" "}
                          Orders app
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
