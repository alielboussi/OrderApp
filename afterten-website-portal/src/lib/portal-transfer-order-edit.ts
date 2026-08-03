export type PortalOrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_key: string | null;
  name: string | null;
  receiving_uom: string | null;
  consumption_uom: string | null;
  qty: number | null;
  cost: number | null;
  amount: number | null;
  package_contains: number | null;
};

export type PortalCatalogProduct = {
  id: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_key: string | null;
  name: string;
  selling_price: number;
  orders_app_uom: string;
  consumption_uom: string;
  units_per_purchase_pack: number;
};

export function clonePortalOrderItems(items: PortalOrderItem[]): PortalOrderItem[] {
  return items.map((item) => ({ ...item }));
}

export function portalOrderItemsMatch(left: PortalOrderItem[], right: PortalOrderItem[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((item) => [item.id, item]));
  return left.every((item) => {
    const other = rightById.get(item.id);
    if (!other) return false;
    return (
      item.product_id === other.product_id &&
      item.variant_key === other.variant_key &&
      item.name === other.name &&
      item.qty === other.qty &&
      item.cost === other.cost &&
      item.receiving_uom === other.receiving_uom &&
      item.consumption_uom === other.consumption_uom &&
      item.package_contains === other.package_contains
    );
  });
}

export function updatePortalOrderItemQty(item: PortalOrderItem, qty: number): PortalOrderItem {
  const nextQty = Math.max(1, Math.floor(qty));
  const packageContains = item.package_contains || 1;
  const cost = Number(item.cost ?? 0);
  return {
    ...item,
    qty: nextQty,
    amount: nextQty * cost,
  };
}

export function getCatalogVariantsForProduct(
  catalog: PortalCatalogProduct[],
  productId: string,
): PortalCatalogProduct[] {
  const normalizedProductId = String(productId ?? "").trim();
  if (!normalizedProductId) return [];
  return catalog
    .filter(
      (product) =>
        String(product.product_id ?? "").trim() === normalizedProductId && Boolean(product.variant_id),
    )
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function applyCatalogProductToOrderItem(
  item: PortalOrderItem,
  product: PortalCatalogProduct,
): PortalOrderItem {
  if (!product.variant_id) {
    throw new Error("Only variants from the same base product can be selected.");
  }
  if (item.product_id && product.product_id !== item.product_id) {
    throw new Error("Variant must stay within the same base product.");
  }
  const packageContains = product.units_per_purchase_pack || 1;
  const qty = Math.max(1, item.qty ?? 1);
  const cost = Number(product.selling_price ?? 0);
  return {
    ...item,
    product_id: product.product_id,
    variant_key: product.variant_key,
    name: product.name.trim(),
    receiving_uom: product.orders_app_uom,
    consumption_uom: product.consumption_uom,
    cost,
    qty,
    package_contains: packageContains,
    amount: qty * cost,
  };
}

export function productBaseName(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  const separator = trimmed.indexOf(" - ");
  return separator > 0 ? trimmed.slice(0, separator) : trimmed;
}

export function resolveCatalogRowForOrderItem(
  item: Pick<PortalOrderItem, "product_id" | "variant_key" | "name">,
  catalog: PortalCatalogProduct[],
): PortalCatalogProduct | undefined {
  const productId = String(item.product_id ?? "").trim();
  if (!productId || catalog.length === 0) return undefined;

  const rows = catalog.filter((row) => String(row.product_id ?? "").trim() === productId);
  if (rows.length === 0) return undefined;

  const variantKey = item.variant_key?.trim();
  if (variantKey) {
    const byVariantKey = rows.find((row) => String(row.variant_key ?? "").trim() === variantKey);
    if (byVariantKey) return byVariantKey;
  }

  const itemName = String(item.name ?? "").trim();
  if (itemName) {
    const byName = rows.find((row) => row.name.trim() === itemName);
    if (byName) return byName;
  }

  return rows.find((row) => !row.variant_id) ?? rows[0];
}

export function resolveBaseProductNameFromCatalog(
  productId: string | null | undefined,
  catalog: PortalCatalogProduct[],
  item?: Pick<PortalOrderItem, "variant_key" | "name">,
): string {
  if (item) {
    const matched = resolveCatalogRowForOrderItem(
      { product_id: productId ?? null, variant_key: item.variant_key ?? null, name: item.name ?? "" },
      catalog,
    );
    const explicit = matched?.product_name?.trim();
    if (explicit) return explicit;
    if (matched && !matched.variant_id) return matched.name.trim();
  }

  const normalizedId = String(productId ?? "").trim();
  if (!normalizedId || catalog.length === 0) return "";

  const rows = catalog.filter((row) => String(row.product_id ?? "").trim() === normalizedId);
  for (const row of rows) {
    const explicit = row.product_name?.trim();
    if (explicit) return explicit;
    if (!row.variant_id && row.name.trim()) return row.name.trim();
  }
  return "";
}

export function resolveVariantDisplayLabel(baseName: string, fullName: string): string {
  const base = baseName.trim();
  const full = fullName.trim();
  if (!full) return "";
  if (!base) return full;
  if (full.toLowerCase() === base.toLowerCase()) return full;

  const dashPrefix = `${base} - `;
  if (full.startsWith(dashPrefix)) return full.slice(dashPrefix.length).trim();

  if (full.toLowerCase().startsWith(base.toLowerCase())) {
    const remainder = full.slice(base.length).trim().replace(/^[-–—]\s*/, "");
    if (remainder) return remainder;
  }

  return full;
}

export type PortalReviewLine = {
  key: string;
  item: PortalOrderItem;
  productName: string;
  displayLabel: string;
  showAsVariant: boolean;
};

export type PortalReviewGroup = {
  productId: string;
  productName: string;
  lines: PortalReviewLine[];
};

export function groupPortalOrderItemsForReview(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
): PortalReviewGroup[] {
  const groups = new Map<string, PortalReviewGroup>();

  for (const item of items) {
    const productId = String(item.product_id ?? item.id).trim();
    const productName =
      resolveBaseProductNameFromCatalog(item.product_id, catalog, item) ||
      productBaseName(item.name) ||
      String(item.name ?? "").trim() ||
      "Product";
    const catalogRow = resolveCatalogRowForOrderItem(item, catalog);
    const showAsVariant = Boolean(item.variant_key?.trim()) || Boolean(catalogRow?.variant_id);
    const displayLabel = showAsVariant
      ? resolveVariantDisplayLabel(productName, String(item.name ?? ""))
      : String(item.name ?? "").trim();

    const group =
      groups.get(productId) ??
      ({
        productId,
        productName,
        lines: [],
      } satisfies PortalReviewGroup);

    if (productName) group.productName = productName;
    group.lines.push({
      key: item.id,
      item,
      productName,
      displayLabel,
      showAsVariant,
    });
    groups.set(productId, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.productName.localeCompare(right.productName, undefined, { sensitivity: "base" }),
  );
}

export function isVariantLine(item: PortalOrderItem, catalog: PortalCatalogProduct[] = []): boolean {
  if (item.variant_key?.trim()) return true;
  const catalogRow = resolveCatalogRowForOrderItem(item, catalog);
  return Boolean(catalogRow?.variant_id);
}

export function variantDisplayLabel(
  item: PortalOrderItem,
  catalog: PortalCatalogProduct[] = [],
): string {
  const productName =
    resolveBaseProductNameFromCatalog(item.product_id, catalog, item) ||
    productBaseName(item.name) ||
    "";
  return resolveVariantDisplayLabel(productName, String(item.name ?? ""));
}

export function sumPortalOrderItems(items: PortalOrderItem[]): { qty: number; amount: number } {
  return items.reduce(
    (acc, item) => {
      const qty = Number(item.qty ?? 0);
      const amount = Number(item.amount ?? (item.cost ?? 0) * qty);
      acc.qty += Number.isFinite(qty) ? qty : 0;
      acc.amount += Number.isFinite(amount) ? amount : 0;
      return acc;
    },
    { qty: 0, amount: 0 },
  );
}

export function toPortalOrderItemPayload(item: PortalOrderItem) {
  return {
    id: item.id,
    product_id: item.product_id,
    variant_key: item.variant_key,
    name: item.name,
    receiving_uom: item.receiving_uom,
    consumption_uom: item.consumption_uom,
    cost: item.cost,
    qty: item.qty,
    package_contains: item.package_contains,
  };
}
