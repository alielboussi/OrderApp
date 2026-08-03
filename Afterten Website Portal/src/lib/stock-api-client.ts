export const DEFAULT_STOCK_CATALOG_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";

export const DEFAULT_STOCK_SYNC_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/stock";

export type StockApiUnit = {
  name?: string | null;
  perUnit?: number | null;
  perSubUnit?: number | null;
};

export type StockApiWarehouseRef = {
  uuid?: string | null;
  name?: string | null;
  active?: boolean | null;
};

export type StockApiCatalogProduct = {
  uuid: string;
  name: string;
  trackStock?: boolean | null;
  unit?: StockApiUnit | null;
  subUnit?: StockApiUnit | null;
  subSubUnit?: StockApiUnit | null;
  warehouse?: StockApiWarehouseRef | null;
  alsoAllowedIn?: StockApiWarehouseRef[] | null;
};

export type StockApiCatalogResponse = {
  ok?: boolean;
  generatedAt?: string;
  productCount?: number;
  warehouseCount?: number;
  products?: StockApiCatalogProduct[];
  warehouses?: StockApiWarehouseRef[];
};

export type SyncStockItem = {
  uuid: string | null;
  name: string;
  qty: number;
  unit?: string | null;
};

export type SyncStockWarehouse = {
  warehouseUuid: string;
  warehouseName: string;
  items?: SyncStockItem[];
};

export type SyncStockResponse = {
  ok?: boolean;
  generatedAt?: string;
  warehouseCount?: number;
  warehouses?: SyncStockWarehouse[];
};

function resolveStockApiToken(): string {
  const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
  if (!token) {
    throw new Error("STOCK_SYNC_API_TOKEN is not configured.");
  }
  return token;
}

async function fetchStockApiJson<T>(url: string): Promise<T> {
  const token = resolveStockApiToken();
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Stock API returned ${response.status} for ${url}.`);
  }

  return (await response.json()) as T;
}

export async function fetchStockCatalog(): Promise<StockApiCatalogResponse> {
  const url = process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL;
  return fetchStockApiJson<StockApiCatalogResponse>(url);
}

export async function fetchStockQuantities(): Promise<SyncStockResponse> {
  const url = process.env.STOCK_SYNC_API_URL?.trim() || DEFAULT_STOCK_SYNC_API_URL;
  return fetchStockApiJson<SyncStockResponse>(url);
}

export function aggregateStockQuantitiesByUuid(payload: SyncStockResponse): Record<string, number> {
  const quantities: Record<string, number> = {};

  for (const warehouse of payload.warehouses ?? []) {
    for (const item of warehouse.items ?? []) {
      const uuid = String(item.uuid ?? "").trim();
      if (!uuid) continue;
      const qty = Number(item.qty ?? 0);
      quantities[uuid] = (quantities[uuid] ?? 0) + (Number.isFinite(qty) ? qty : 0);
    }
  }

  return quantities;
}
