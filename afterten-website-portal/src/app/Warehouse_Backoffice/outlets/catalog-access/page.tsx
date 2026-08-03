"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildCatalogAccessEntries } from "@/lib/outlet-catalog-access";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";

type Outlet = { id: string; name: string; auth_user_id?: string | null };
type LinkedUser = { uid: string; email: string | null } | null;
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
  item_kind?: string;
  has_variations?: boolean;
  allow_orders: boolean;
  variants: CatalogVariant[];
};

type KindFilter = "all" | "finished" | "ingredient" | "raw";

const KIND_LABELS: Record<Exclude<KindFilter, "all">, string> = {
  finished: "Products",
  ingredient: "Ingredients",
  raw: "Raw materials",
};

function kindLabel(kind?: string) {
  if (kind === "ingredient") return "Ingredient";
  if (kind === "raw") return "Raw";
  return "Product";
}

export default function OutletCatalogAccessPage() {
  const searchParams = useSearchParams();
  const { status, readOnly } = useWarehouseAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [linkedUser, setLinkedUser] = useState<LinkedUser>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

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
      setLinkedUser(json.linked_orders_app_user ?? null);
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
    const fromQuery = searchParams.get("outlet_id")?.trim();
    if (fromQuery && !outletId) {
      setOutletId(fromQuery);
    }
  }, [searchParams, outletId]);

  useEffect(() => {
    if (outletId) void loadCatalog(outletId);
  }, [outletId, loadCatalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((item) => {
      if (kindFilter !== "all" && (item.item_kind ?? "finished") !== kindFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? "").toLowerCase().includes(q) ||
        item.variants.some((v) => v.name.toLowerCase().includes(q))
      );
    });
  }, [catalog, search, kindFilter]);

  const toggleItem = (itemId: string, value: boolean) => {
    setCatalog((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (item.has_variations && item.variants.length > 0) {
          const variants =
            value && item.variants.length === 1
              ? item.variants.map((variant) => ({ ...variant, allow_orders: true }))
              : item.variants.map((variant) => ({ ...variant, allow_orders: value ? variant.allow_orders : false }));
          return { ...item, allow_orders: value, variants };
        }
        return { ...item, allow_orders: value };
      }),
    );
  };

  const toggleVariant = (itemId: string, variantId: string, value: boolean) => {
    setCatalog((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const variants = item.variants.map((variant) =>
          variant.id === variantId ? { ...variant, allow_orders: value } : variant,
        );
        return {
          ...item,
          allow_orders: variants.some((variant) => variant.allow_orders),
          variants,
        };
      }),
    );
  };

  const save = async () => {
    if (!outletId || readOnly) return;
    if (!linkedUser?.uid) {
      setMessage("This outlet has no Orders app login. Create the outlet first on Create Outlet.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const entries = buildCatalogAccessEntries(catalog);
      const res = await fetch("/api/outlet-catalog-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          assignment_role: "orders",
          entries,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setCatalog(Array.isArray(json.catalog) ? json.catalog : []);
      setLinkedUser(json.linked_orders_app_user ?? linkedUser);
      setMessage("Saved. Orders app catalog updated for this outlet.");
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h3 className={eb.pageCardTitle}>Outlet Catalog Access</h3>
            <p className={eb.pageCardBody}>
              Select an outlet and choose products, variants, and ingredients for the Orders app.
              Login is set when you create the outlet — no UID paste needed.
            </p>
          </div>
          <Link href="/Warehouse_Backoffice/outlets/create" className={eb.btnSecondary}>
            Create Outlet
          </Link>
        </div>
      </section>

      <section className={eb.pageCard} style={{ display: "grid", gap: 12, maxWidth: 900 }}>
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

        {outletId ? (
          <div className={eb.pageCardBody} style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
            {linkedUser?.email ? (
              <>
                <strong>Orders app login:</strong> {linkedUser.email}
              </>
            ) : (
              <>
                No Orders app login linked.{" "}
                <Link href="/Warehouse_Backoffice/outlets/create">Create outlet</Link> with email + password first.
              </>
            )}
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["all", "finished", "ingredient", "raw"] as KindFilter[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={kindFilter === kind ? eb.btnAdd : eb.btnSecondary}
              onClick={() => setKindFilter(kind)}
            >
              {kind === "all" ? "All" : KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        <input
          className={eb.fieldInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search catalog…"
        />
      </section>

      {message ? <p className={eb.pageCardBody}>{message}</p> : null}

      {outletId ? (
        <section className={eb.pageCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
              Catalog items
            </h3>
            <button type="button" className={eb.btnAdd} disabled={saving || readOnly || !linkedUser?.uid} onClick={() => void save()}>
              {saving ? "Saving…" : "Save access rules"}
            </button>
          </div>
          {loading ? <p className={eb.pageCardBody}>Loading…</p> : null}
          {!loading && filtered.length === 0 ? <p className={eb.pageCardBody}>No items in this filter.</p> : null}
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {filtered.map((item) => (
              <div key={item.id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>
                    {kindLabel(item.item_kind)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#57606a" }}>{item.sku ?? "—"}</div>
                {!item.has_variations || item.variants.length === 0 ? (
                  <label style={{ display: "block", marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={item.allow_orders}
                      onChange={(e) => toggleItem(item.id, e.target.checked)}
                    />{" "}
                    Show in Orders app
                  </label>
                ) : (
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.allow_orders}
                        onChange={(e) => toggleItem(item.id, e.target.checked)}
                      />{" "}
                      Show in Orders app
                    </label>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                      Select at least one variant below.
                    </p>
                    {item.variants.map((variant) => (
                      <div key={variant.id} style={{ paddingLeft: 12, borderLeft: "3px solid #d4af37" }}>
                        <div style={{ fontWeight: 500 }}>{variant.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{variant.sku ?? "—"}</div>
                        <label>
                          <input
                            type="checkbox"
                            checked={variant.allow_orders}
                            onChange={(e) => toggleVariant(item.id, variant.id, e.target.checked)}
                          />{" "}
                          Show variant in Orders app
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
