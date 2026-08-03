import {
  aggregateStockQuantitiesByUuid,
  resolveCatalogStockUuid,
} from "./stock-control";
import { listFirestoreCatalogItems, listFirestoreCatalogVariants } from "./firestore-catalog-store";

export type CatalogStockRow = {
  kind: "product" | "variant";
  catalog_id: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  stock_uuid: string;
};

export type StockApiRowWithoutUuid = {
  name: string;
  qty: number;
  unit: string | null;
  warehouse_uuid: string;
  warehouse_name: string;
};

type SyncStockItem = {
  uuid: string | null;
  name: string;
  qty: number;
  unit?: string | null;
};

export type StockControlAlignmentReport = {
  generated_at: string;
  stock_generated_at: string;
  summary: {
    catalog_rows: number;
    active_only?: boolean;
    catalog_matched_in_stock_api: number;
    catalog_missing_in_stock_api: number;
    stock_rows_with_uuid: number;
    stock_rows_without_uuid: number;
  };
  catalog_missing_in_stock_api: CatalogStockRow[];
  stock_api_rows_without_uuid: StockApiRowWithoutUuid[];
};

type SyncStockWarehouse = {
  warehouseUuid: string;
  warehouseName: string;
  items: SyncStockItem[];
};

type SyncStockResponse = {
  generatedAt?: string;
  warehouses?: SyncStockWarehouse[];
};

export function collectStockApiRowsWithoutUuid(payload: SyncStockResponse): StockApiRowWithoutUuid[] {
  const rows: StockApiRowWithoutUuid[] = [];
  const seen = new Set<string>();

  for (const warehouse of payload.warehouses ?? []) {
    for (const item of warehouse.items ?? []) {
      const uuid = String(item.uuid ?? "").trim();
      if (uuid) continue;
      const name = String(item.name ?? "").trim() || "Unnamed item";
      const key = `${warehouse.warehouseUuid}::${name}::${item.qty}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        name,
        qty: Number(item.qty ?? 0),
        unit: item.unit ?? null,
        warehouse_uuid: warehouse.warehouseUuid,
        warehouse_name: warehouse.warehouseName,
      });
    }
  }

  return rows.sort((left, right) => {
    const warehouse = left.warehouse_name.localeCompare(right.warehouse_name, undefined, { sensitivity: "base" });
    if (warehouse !== 0) return warehouse;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export async function buildCatalogStockRows(options?: { activeOnly?: boolean }): Promise<CatalogStockRow[]> {
  const activeOnly = options?.activeOnly !== false;
  const [items, variants] = await Promise.all([
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: false }),
  ]);

  const variantItemIds = new Set(
    variants.map((variant) => String(variant.item_id ?? "").trim()).filter(Boolean),
  );

  const rows: CatalogStockRow[] = [];

  for (const item of items) {
    if (activeOnly && item.active === false) continue;
    const productId = String(item.id ?? "").trim();
    if (!productId) continue;
    if (variantItemIds.has(productId)) continue;
    rows.push({
      kind: "product",
      catalog_id: productId,
      product_id: productId,
      variant_id: null,
      name: String(item.name ?? "Product"),
      stock_uuid: productId,
    });
  }

  for (const variant of variants) {
    if (activeOnly && variant.active === false) continue;
    const variantId = String(variant.id ?? "").trim();
    const productId = String(variant.item_id ?? "").trim();
    if (!variantId || !productId) continue;
    rows.push({
      kind: "variant",
      catalog_id: variantId,
      product_id: productId,
      variant_id: variantId,
      name: String(variant.name ?? "Variant"),
      stock_uuid: variantId,
    });
  }

  return rows.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export async function buildStockControlAlignmentReport(): Promise<StockControlAlignmentReport> {
  const url = process.env.STOCK_SYNC_API_URL?.trim();
  const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
  if (!token) {
    throw new Error("STOCK_SYNC_API_TOKEN is not configured.");
  }

  const response = await fetch(url || "https://afterten-stock-api-896827614552.us-central1.run.app/sync/stock", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Stock sync API returned ${response.status}.`);
  }

  const payload = (await response.json()) as SyncStockResponse;
  const quantitiesByUuid = aggregateStockQuantitiesByUuid(payload);
  const catalogRows = await buildCatalogStockRows({ activeOnly: true });
  const catalogMissing = catalogRows.filter((row) => !(row.stock_uuid in quantitiesByUuid));
  const stockWithoutUuid = collectStockApiRowsWithoutUuid(payload);

  let stockRowsWithUuid = 0;
  for (const warehouse of payload.warehouses ?? []) {
    for (const item of warehouse.items ?? []) {
      if (String(item.uuid ?? "").trim()) stockRowsWithUuid += 1;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    stock_generated_at: payload.generatedAt ?? new Date().toISOString(),
    summary: {
      catalog_rows: catalogRows.length,
      active_only: true,
      catalog_matched_in_stock_api: catalogRows.length - catalogMissing.length,
      catalog_missing_in_stock_api: catalogMissing.length,
      stock_rows_with_uuid: stockRowsWithUuid,
      stock_rows_without_uuid: stockWithoutUuid.length,
    },
    catalog_missing_in_stock_api: catalogMissing,
    stock_api_rows_without_uuid: stockWithoutUuid,
  };
}

export function resolveCatalogStockUuidFromRow(row: {
  product_id: string;
  variant_id?: string | null;
}): string {
  return resolveCatalogStockUuid({
    productId: row.product_id,
    variantId: row.variant_id ?? null,
  });
}
