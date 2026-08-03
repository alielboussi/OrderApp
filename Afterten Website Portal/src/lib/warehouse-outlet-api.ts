export type WarehouseOutletOption = {
  id: string;
  name: string;
};

export type OutletWarehouseLink = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
};

/** Load selling outlets via dual-backend API (replaces whoami_roles / whoami_outlet). */
export async function fetchSellingOutlets(scope: "selling" | "middleware" = "selling"): Promise<WarehouseOutletOption[]> {
  const res = await fetch(`/api/outlets?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  const json = (await res.json()) as { outlets?: Array<{ id: string; name?: string | null }>; error?: string };
  if (!res.ok) {
    throw new Error(json.error || "Unable to load outlets");
  }
  return (json.outlets ?? [])
    .filter((outlet) => outlet?.id)
    .map((outlet) => ({
      id: outlet.id,
      name: (outlet.name ?? outlet.id).trim(),
    }));
}

/** Load outlet↔warehouse links (optionally filtered to given outlet ids). */
export async function fetchOutletWarehouseLinks(options?: {
  outletIds?: string[];
  scope?: "outlet" | null;
}): Promise<OutletWarehouseLink[]> {
  const params = new URLSearchParams();
  if (options?.scope) params.set("scope", options.scope);
  const res = await fetch(`/api/outlet-warehouses?${params.toString()}`, { cache: "no-store" });
  const json = (await res.json()) as {
    links?: Array<{
      outlet_id: string;
      outlet_name?: string;
      warehouse_id: string;
      warehouse_name?: string;
    }>;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error || "Unable to load outlet warehouses");
  }
  let links = (json.links ?? []).filter((link) => link?.outlet_id && link?.warehouse_id);
  if (options?.outletIds && options.outletIds.length > 0) {
    const allowed = new Set(options.outletIds);
    links = links.filter((link) => allowed.has(link.outlet_id));
  }
  return links.map((link) => ({
    outlet_id: link.outlet_id,
    outlet_name: (link.outlet_name ?? link.outlet_id).trim(),
    warehouse_id: link.warehouse_id,
    warehouse_name: (link.warehouse_name ?? link.warehouse_id).trim(),
  }));
}

/** Resolve catalog variant id → name via dual-backend catalog API. */
export async function fetchVariantNames(variantIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(variantIds.filter(Boolean)));
  const map: Record<string, string> = {};
  if (unique.length === 0) return map;

  await Promise.all(
    unique.map(async (id) => {
      const res = await fetch(`/api/catalog/variants?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { variants?: Array<{ id: string; name?: string | null }> };
      const variant = json.variants?.[0];
      if (variant?.id) {
        map[variant.id] = (variant.name ?? variant.id).trim();
      }
    }),
  );
  return map;
}

/** Resolve catalog item id → name via dual-backend catalog API. */
export async function fetchCatalogItemNames(itemIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  await Promise.all(
    unique.map(async (id) => {
      const res = await fetch(`/api/catalog/items?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { item?: { id: string; name?: string | null } };
      if (json.item?.id) {
        map.set(json.item.id, (json.item.name ?? json.item.id).trim());
      }
    }),
  );
  return map;
}
