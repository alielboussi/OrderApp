/**
 * Stock Control — portal/server helpers.
 *
 * UUID alignment:
 * - catalog_items.id  ↔ stock API item.uuid (simple products)
 * - catalog_variants.id ↔ stock API item.uuid (variants)
 *
 * Keep STOCK_CONTROL_ENABLED=false until go-live.
 */

import {
  aggregateStockQuantitiesByUuid,
  fetchStockQuantities,
} from "@/lib/stock-api-client";

export const STOCK_CONTROL_ENABLED = false;

export type StockQuantityMap = Record<string, number>;

export { aggregateStockQuantitiesByUuid };

export function resolveCatalogStockUuid(options: {
  productId: string | null | undefined;
  variantId?: string | null;
}): string {
  const variantId = String(options.variantId ?? "").trim();
  if (variantId) return variantId;
  return String(options.productId ?? "").trim();
}

export async function fetchSyncStockQuantities(): Promise<{
  generatedAt: string;
  quantitiesByUuid: StockQuantityMap;
}> {
  const payload = await fetchStockQuantities();
  return {
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
    quantitiesByUuid: aggregateStockQuantitiesByUuid(payload),
  };
}

export function findCatalogRowsMissingStockUuid<
  T extends { product_id: string; variant_id: string | null; name: string },
>(rows: T[], quantitiesByUuid: StockQuantityMap): Array<{ row: T; stockUuid: string }> {
  return rows
    .map((row) => ({
      row,
      stockUuid: resolveCatalogStockUuid({
        productId: row.product_id,
        variantId: row.variant_id,
      }),
    }))
    .filter((entry) => entry.stockUuid && !(entry.stockUuid in quantitiesByUuid));
}
