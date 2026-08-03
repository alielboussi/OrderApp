import type { MenuGroupSyncFields } from "@/lib/catalogMenuGroup";

const VAT_RATE = 1.16;

export function vatExcludedFromSellingPrice(sellingPrice: number | null | undefined): number | null {
  if (sellingPrice == null || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return null;
  }
  return Math.round((sellingPrice / VAT_RATE) * 100) / 100;
}

export type CatalogSyncMode = "insert_only" | "upsert";

export function withCatalogSyncMode(
  payload: Record<string, unknown>,
  mode: CatalogSyncMode,
): Record<string, unknown> {
  return {
    ...payload,
    sync_mode: mode,
  };
}

export function withCatalogSyncSchedule(
  payload: Record<string, unknown>,
  scheduledAt: string | null | undefined,
): Record<string, unknown> {
  return {
    ...payload,
    scheduled_at: scheduledAt ?? null,
  };
}

function middlewarePriceFields(
  sellingPrice: number | null | undefined,
): { price: number; vat_exc_price: number | null } | Record<string, never> {
  if (sellingPrice == null || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return {};
  }
  return {
    price: sellingPrice,
    vat_exc_price: vatExcludedFromSellingPrice(sellingPrice),
  };
}

export function buildItemMiddlewarePayload(params: {
  sku: string | null;
  name: string;
  sellingPrice: number | null;
  groupFields?: MenuGroupSyncFields;
}): Record<string, unknown> {
  return {
    change_type: "upsert_item",
    sku: params.sku,
    name: params.name,
    ...middlewarePriceFields(params.sellingPrice),
    ...(params.groupFields ?? {}),
  };
}

export function buildVariantMiddlewarePayload(params: {
  itemSku: string | null;
  variantSku: string | null;
  variantName: string;
  sellingPrice: number | null;
  posFlavourId: string | null;
  groupFields?: MenuGroupSyncFields;
}): Record<string, unknown> {
  return {
    change_type: "upsert_variant",
    item_sku: params.itemSku,
    variant_sku: params.variantSku,
    variant_name: params.variantName,
    ...middlewarePriceFields(params.sellingPrice),
    ...(params.posFlavourId ? { pos_flavour_id: params.posFlavourId } : {}),
    ...(params.groupFields ?? {}),
  };
}
