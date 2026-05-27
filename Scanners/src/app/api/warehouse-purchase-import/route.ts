import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const SOURCE = "afterten_stock_api";
const API_BASE_URL = "https://afterten-stock-api-896827614552.us-central1.run.app";
const API_PATH = "/stock/movements?type=receive";
const DEFAULT_ITEM_KIND = "ingredient";

type ApiMovementRaw = {
  _id?: string | null;
  lotId?: string | null;
  productId?: string | null;
  productName?: string | null;
  sku?: string | null;
  variantSku?: string | null;
  itemSku?: string | null;
  purchaseUom?: string | null;
  purchase_uom?: string | null;
  purchasePackUnit?: string | null;
  purchase_pack_unit?: string | null;
  unitsInsidePurchaseProduct?: number | string | null;
  units_inside_purchase_product?: number | string | null;
  unitsPerPurchasePack?: number | string | null;
  units_per_purchase_pack?: number | string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  outletId?: string | null;
  type?: string | null;
  qty?: number | string | null;
  unitCost?: number | string | null;
  totalCost?: number | string | null;
  balanceAfter?: number | string | null;
  unit?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  ref?: { invoiceId?: string | null } | null;
  by?: { name?: string | null } | null;
  at?: string | null;
};

type CatalogVariantRow = {
  id: string;
  item_id: string;
  name: string | null;
  default_warehouse_id: string | null;
  active: boolean | null;
  sku: string | null;
  item_kind: string | null;
  units_per_purchase_pack: number | null;
  purchase_pack_unit: string | null;
  consumption_uom: string | null;
  cost: number | null;
};

type CatalogItemRow = {
  id: string;
  name: string | null;
  default_warehouse_id: string | null;
  active: boolean | null;
  sku: string | null;
  item_kind: string | null;
  units_per_purchase_pack: number | null;
  purchase_pack_unit: string | null;
  consumption_uom: string | null;
  consumption_qty_per_base: number | null;
  cost: number | null;
};

type StorageHomeRow = {
  item_id: string;
  normalized_variant_key: string | null;
  storage_warehouse_id: string | null;
};

type WarehouseRow = { id: string; name: string | null };

type PeriodRow = {
  id: string;
  warehouse_id: string;
  opened_at: string | null;
  status: string | null;
};

type StockCountRow = {
  period_id: string;
  item_id: string;
  variant_key: string | null;
  kind: string | null;
};

type PurchaseReceiptRow = {
  id: string;
  warehouse_id: string;
  reference_code: string;
};

type ImportRow = {
  source_movement_id: string;
  receipt_id: string | null;
  status: string | null;
};

type ImportStatus =
  | "ready"
  | "imported"
  | "duplicate"
  | "duplicate_receipt"
  | "missing_item"
  | "missing_storage_home"
  | "missing_open_period"
  | "missing_opening_stock"
  | "invalid_qty"
  | "error";

type MatchedMovement = {
  movementId: string | null;
  lotId: string | null;
  productId: string | null;
  productName: string | null;
  sku: string | null;
  variantSku?: string | null;
  itemSku?: string | null;
  apiPurchasePackUnit?: string | null;
  apiUnitsPerPurchasePack?: number | null;
  qty: number | null;
  unitCost: number | null;
  totalCost: number | null;
  warehouseId: string | null;
  warehouseName: string | null;
  invoiceId: string | null;
  operatorName: string | null;
  movementAt: string | null;
  itemId: string | null;
  itemName: string | null;
  variantId?: string | null;
  variantKey: string | null;
  variantName: string | null;
  defaultWarehouseId: string | null;
  storageWarehouseId?: string | null;
  unitsPerPurchasePack?: number | null;
  purchasePackUnit?: string | null;
  consumptionUom?: string | null;
  itemKind?: string | null;
};

type ImportItem = {
  movement_id: string;
  lot_id: string | null;
  product_id: string | null;
  product_name: string | null;
  item_sku: string | null;
  variant_sku: string | null;
  sku: string | null;
  qty: number | null;
  unit_cost: number | null;
  total_cost: number | null;
  movement_at: string | null;
  invoice_id: string | null;
  operator_name: string | null;
  api_warehouse_id: string | null;
  api_warehouse_name: string | null;
  item_id: string | null;
  item_name: string | null;
  variant_key: string | null;
  variant_name: string | null;
  storage_warehouse_id: string | null;
  storage_warehouse_name: string | null;
  receipt_reference: string | null;
  receipt_id: string | null;
  status: ImportStatus;
  status_message?: string | null;
  created_item: boolean;
  created_variant: boolean;
};

type ImportSummary = {
  total: number;
  imported: number;
  ready: number;
  duplicates: number;
  missing_item: number;
  missing_storage_home: number;
  missing_open_period: number;
  missing_opening_stock: number;
  invalid_qty: number;
  errors: number;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "base";
  return trimmed.toLowerCase();
}

function normalizeWarehouseName(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : null;
}

function normalizePackUnit(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readPurchasePackUnit(raw: Record<string, unknown>): string | null {
  return (
    normalizePackUnit(cleanText(raw.unitName)) ??
    normalizePackUnit(cleanText(raw.unit)) ??
    normalizePackUnit(cleanText(raw.purchaseUom)) ??
    normalizePackUnit(cleanText(raw.purchase_uom)) ??
    normalizePackUnit(cleanText(raw.purchasePackUnit)) ??
    normalizePackUnit(cleanText(raw.purchase_pack_unit)) ??
    normalizePackUnit(cleanText(raw.purchaseUOM)) ??
    null
  );
}

function readUnitsPerPurchasePack(raw: Record<string, unknown>): number | null {
  const candidate =
    cleanNumber(raw.unitsInsidePurchaseProduct) ??
    cleanNumber(raw.units_inside_purchase_product) ??
    cleanNumber(raw.unitsPerPurchasePack) ??
    cleanNumber(raw.units_per_purchase_pack) ??
    null;
  if (candidate === null || candidate === undefined) return null;
  if (!Number.isFinite(candidate) || candidate <= 0) return null;
  return candidate;
}

function resolveUnitsPerPurchasePack(
  variant?: CatalogVariantRow | null,
  item?: CatalogItemRow | null
): number {
  const variantUnits =
    typeof variant?.units_per_purchase_pack === "number" ? variant.units_per_purchase_pack : null;
  const itemUnits =
    typeof item?.units_per_purchase_pack === "number" ? item.units_per_purchase_pack : null;
  const candidate = variantUnits ?? itemUnits ?? 1;
  if (!Number.isFinite(candidate) || candidate <= 0) return 1;
  return candidate;
}

function computeEffectiveQty(qty: number | null, unitsPerPack: number): number | null {
  if (qty === null || qty === undefined) return null;
  const numeric = Number(qty);
  if (!Number.isFinite(numeric)) return null;
  return numeric * (Number.isFinite(unitsPerPack) && unitsPerPack > 0 ? unitsPerPack : 1);
}

function computeEffectiveUnitCost(unitCost: number | null, unitsPerPack: number): number | null {
  if (unitCost === null || unitCost === undefined) return null;
  const numeric = Number(unitCost);
  if (!Number.isFinite(numeric)) return null;
  if (!Number.isFinite(unitsPerPack) || unitsPerPack <= 0) return numeric;
  return numeric / unitsPerPack;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(
      value.trim()
    )
  );
}

function buildSummary(items: ImportItem[]): ImportSummary {
  const summary: ImportSummary = {
    total: items.length,
    imported: 0,
    ready: 0,
    duplicates: 0,
    missing_item: 0,
    missing_storage_home: 0,
    missing_open_period: 0,
    missing_opening_stock: 0,
    invalid_qty: 0,
    errors: 0,
  };

  items.forEach((item) => {
    switch (item.status) {
      case "imported":
        summary.imported += 1;
        break;
      case "ready":
        summary.ready += 1;
        break;
      case "duplicate":
      case "duplicate_receipt":
        summary.duplicates += 1;
        break;
      case "missing_item":
        summary.missing_item += 1;
        break;
      case "missing_storage_home":
        summary.missing_storage_home += 1;
        break;
      case "missing_open_period":
        summary.missing_open_period += 1;
        break;
      case "missing_opening_stock":
        summary.missing_opening_stock += 1;
        break;
      case "invalid_qty":
        summary.invalid_qty += 1;
        break;
      case "error":
        summary.errors += 1;
        break;
    }
  });

  return summary;
}

export async function POST(req: NextRequest) {
  let debugStep = "init";
  let debugEnabled = false;
  let debugEnv: Record<string, boolean> | undefined;
  const debugCounts: Record<string, number> = {};

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const envToken = process.env.Afterten_Purchases_Api_Token?.trim();
    const headerToken = req.headers.get("x-afterten-token")?.trim();
    const token = envToken || (process.env.NODE_ENV !== "production" ? headerToken : undefined);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Afterten_Purchases_Api_Token is missing" },
        { status: 500 }
      );
    }

    const envStocktakeUserId = process.env.Afterten_Stocktake_User_Id?.trim();
    const headerStocktakeUserId = req.headers.get("x-afterten-stocktake-user")?.trim();
    const rawStocktakeUserId =
      envStocktakeUserId || (process.env.NODE_ENV !== "production" ? headerStocktakeUserId : undefined);
    const debugToken = process.env.Afterten_Debug_Token?.trim();
    const headerDebug = req.headers.get("x-afterten-debug")?.trim();
    debugEnabled = Boolean(debugToken && headerDebug && headerDebug === debugToken);
    debugEnv = debugEnabled
      ? {
          hasPurchaseToken: Boolean(envToken),
          hasSupabaseUrl: Boolean(process.env.SUPABASE_URL?.trim()),
          hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
          hasStocktakeUserId: Boolean(rawStocktakeUserId),
        }
      : undefined;
    let stocktakeUserId = rawStocktakeUserId && isUuid(rawStocktakeUserId)
      ? rawStocktakeUserId
      : null;

    debugStep = "fetch-api";
    const response = await fetch(`${API_BASE_URL}${API_PATH}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: text || response.statusText },
        { status: 502 }
      );
    }

    debugStep = "parse-api";
    const payload = await response.json().catch(() => ({}));
    const rawItems: ApiMovementRaw[] = Array.isArray(payload?.items) ? payload.items : [];

    debugCounts.movements = rawItems.length;

    debugStep = "normalize-movements";
    const movements = rawItems.map((item) => {
      const qty = cleanNumber(item.qty);
      const unitCost = cleanNumber(item.unitCost);
      const totalCost = cleanNumber(item.totalCost);
      const apiPurchasePackUnit = readPurchasePackUnit(item as Record<string, unknown>);
      const apiUnitsPerPurchasePack = readUnitsPerPurchasePack(item as Record<string, unknown>);
      return {
        movementId: cleanText(item._id),
        lotId: cleanText(item.lotId),
        productId: cleanText(item.productId),
        productName: cleanText(item.productName),
        sku: cleanText(item.sku),
        variantSku: cleanText(item.variantSku),
        itemSku: cleanText(item.itemSku),
        apiPurchasePackUnit,
        apiUnitsPerPurchasePack,
        qty,
        unitCost,
        totalCost,
        warehouseId: cleanText(item.warehouseId),
        warehouseName: cleanText(item.warehouseName),
        invoiceId: cleanText(item.ref?.invoiceId),
        operatorName: cleanText(item.by?.name),
        movementAt: cleanText(item.at),
      };
    });

    const productIds = Array.from(
      new Set(movements.map((row) => row.productId).filter(isUuid))
    );
    const skuList = Array.from(
      new Set(
        movements
          .flatMap((row) => [row.variantSku, row.itemSku, row.sku])
          .filter((value): value is string => !!value)
      )
    );
    const warehouseNames = Array.from(
      new Set(movements.map((row) => row.warehouseName).filter((value): value is string => !!value))
    );

    debugCounts.productIds = productIds.length;
    debugCounts.skuList = skuList.length;
    debugCounts.warehouseNames = warehouseNames.length;

    const supabase = getServiceClient();

    if (debugEnabled) debugStep = "validate-stocktake-user";
    if (stocktakeUserId) {
      const { data, error } = await supabase
        .from("stocktake_app_users")
        .select("id")
        .eq("id", stocktakeUserId)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) stocktakeUserId = null;
    }

    debugStep = "load-catalog";
    const [variantByIdRes, variantBySkuRes, warehouseByNameRes] = await Promise.all([
      productIds.length
        ? supabase
            .from("catalog_variants")
            .select(
              "id,item_id,name,default_warehouse_id,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,cost"
            )
            .in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      skuList.length
        ? supabase
            .from("catalog_variants")
            .select(
              "id,item_id,name,default_warehouse_id,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,cost"
            )
            .in("sku", skuList)
        : Promise.resolve({ data: [], error: null }),
      warehouseNames.length
        ? supabase.from("warehouses").select("id,name").in("name", warehouseNames)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (variantByIdRes.error) throw variantByIdRes.error;
    if (variantBySkuRes.error) throw variantBySkuRes.error;
    if (warehouseByNameRes.error) throw warehouseByNameRes.error;

    const warehouseByNameRows = (warehouseByNameRes.data as WarehouseRow[] | null) ?? [];
    const warehouseByName = new Map<string, WarehouseRow>();
    warehouseByNameRows.forEach((row) => {
      const key = normalizeWarehouseName(row.name ?? null);
      if (key) warehouseByName.set(key, row);
    });

    const variantRows = [
      ...((variantByIdRes.data as CatalogVariantRow[] | null) ?? []),
      ...((variantBySkuRes.data as CatalogVariantRow[] | null) ?? []),
    ].filter((row) => row?.id);

    const variantById = new Map<string, CatalogVariantRow>();
    const variantBySku = new Map<string, CatalogVariantRow>();
    variantRows.forEach((row) => {
      if (row.active === false) return;
      variantById.set(row.id, row);
      if (row.sku) variantBySku.set(row.sku, row);
    });

    const itemIdsFromVariants = Array.from(new Set(variantRows.map((row) => row.item_id)));
    const itemIdsToFetch = Array.from(new Set([...productIds, ...itemIdsFromVariants]));

    const [itemByIdRes, itemBySkuRes] = await Promise.all([
      itemIdsToFetch.length
        ? supabase
            .from("catalog_items")
            .select(
              "id,name,default_warehouse_id,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,consumption_qty_per_base,cost"
            )
            .in("id", itemIdsToFetch)
        : Promise.resolve({ data: [], error: null }),
      skuList.length
        ? supabase
            .from("catalog_items")
            .select(
              "id,name,default_warehouse_id,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,consumption_qty_per_base,cost"
            )
            .in("sku", skuList)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (itemByIdRes.error) throw itemByIdRes.error;
    if (itemBySkuRes.error) throw itemBySkuRes.error;

    const itemRows = [
      ...((itemByIdRes.data as CatalogItemRow[] | null) ?? []),
      ...((itemBySkuRes.data as CatalogItemRow[] | null) ?? []),
    ].filter((row) => row?.id);

    const itemById = new Map<string, CatalogItemRow>();
    const itemBySku = new Map<string, CatalogItemRow>();
    itemRows.forEach((row) => {
      if (row.active === false) return;
      itemById.set(row.id, row);
      if (row.sku) itemBySku.set(row.sku, row);
    });

    const matchMovement = (row: typeof movements[number]): MatchedMovement => {
      const variantMatch =
        (row.productId && isUuid(row.productId) ? variantById.get(row.productId) : undefined) ||
        (row.variantSku ? variantBySku.get(row.variantSku) : undefined) ||
        (!row.variantSku && row.sku ? variantBySku.get(row.sku) : undefined);

      if (variantMatch) {
        const parentItem = itemById.get(variantMatch.item_id) ?? null;
        return {
          ...row,
          itemId: variantMatch.item_id,
          itemName: parentItem?.name ?? row.productName ?? null,
          variantId: variantMatch.id,
          variantKey: normalizeVariantKey(variantMatch.id),
          variantName: variantMatch.name ?? null,
          defaultWarehouseId:
            variantMatch.default_warehouse_id ?? parentItem?.default_warehouse_id ?? null,
          unitsPerPurchasePack: resolveUnitsPerPurchasePack(variantMatch, parentItem),
          purchasePackUnit: variantMatch.purchase_pack_unit ?? parentItem?.purchase_pack_unit ?? null,
          consumptionUom: variantMatch.consumption_uom ?? parentItem?.consumption_uom ?? null,
          itemKind: variantMatch.item_kind ?? parentItem?.item_kind ?? null,
        };
      }

      if (row.variantSku) {
        return {
          ...row,
          itemId: null,
          itemName: row.productName ?? null,
          variantId: null,
          variantKey: null,
          variantName: null,
          defaultWarehouseId: null,
          unitsPerPurchasePack: null,
          purchasePackUnit: null,
          consumptionUom: null,
          itemKind: null,
        };
      }

      const itemMatch =
        (row.productId && isUuid(row.productId) ? itemById.get(row.productId) : undefined) ||
        (row.itemSku ? itemBySku.get(row.itemSku) : undefined) ||
        (row.sku ? itemBySku.get(row.sku) : undefined);

      if (itemMatch) {
        return {
          ...row,
          itemId: itemMatch.id,
          itemName: itemMatch.name ?? row.productName ?? null,
          variantId: null,
          variantKey: "base",
          variantName: null,
          defaultWarehouseId: itemMatch.default_warehouse_id ?? null,
          unitsPerPurchasePack: resolveUnitsPerPurchasePack(null, itemMatch),
          purchasePackUnit: itemMatch.purchase_pack_unit ?? null,
          consumptionUom: itemMatch.consumption_uom ?? null,
          itemKind: itemMatch.item_kind ?? null,
        };
      }

      return {
        ...row,
        itemId: null,
        itemName: row.productName ?? null,
        variantId: null,
        variantKey: null,
        variantName: null,
        defaultWarehouseId: null,
        unitsPerPurchasePack: null,
        purchasePackUnit: null,
        consumptionUom: null,
        itemKind: null,
      };
    };

    const itemCreationPlans = new Map<
      string,
      {
        key: string;
        name: string;
        sku: string | null;
        defaultWarehouseId: string | null;
        itemKind: string;
        cost: number | null;
        purchasePackUnit: string | null;
        unitsPerPurchasePack: number | null;
      }
    >();
    const variantCreationPlans = new Map<
      string,
      {
        key: string;
        itemKey: string | null;
        itemId: string | null;
        id: string;
        name: string;
        sku: string | null;
        defaultWarehouseId: string | null;
        itemKind: string;
        cost: number | null;
        purchasePackUnit: string | null;
        unitsPerPurchasePack: number | null;
      }
    >();
    const createdItemIds = new Set<string>();
    const createdVariantIds = new Set<string>();

    const resolveItemKey = (row: typeof movements[number], baseSku: string | null): string | null => {
      if (baseSku) return `sku:${baseSku}`;
      if (row.productName) return `name:${row.productName}`;
      return null;
    };

    movements.forEach((row) => {
      const baseSku = row.itemSku || (row.sku && row.sku !== row.variantSku ? row.sku : null) || null;
      const variantMatch =
        (row.productId && isUuid(row.productId) ? variantById.get(row.productId) : undefined) ||
        (row.variantSku ? variantBySku.get(row.variantSku) : undefined) ||
        (!row.variantSku && row.sku ? variantBySku.get(row.sku) : undefined);
      const itemMatch =
        (row.productId && isUuid(row.productId) ? itemById.get(row.productId) : undefined) ||
        (row.itemSku ? itemBySku.get(row.itemSku) : undefined) ||
        (!row.variantSku && row.sku ? itemBySku.get(row.sku) : undefined);

      const preferredWarehouseId =
        warehouseByName.get(normalizeWarehouseName(row.warehouseName ?? null) ?? "")?.id ?? null;
      const rawUnitCost = row.unitCost ?? (row.totalCost && row.qty ? row.totalCost / row.qty : null);
      const apiPurchasePackUnit = normalizePackUnit(row.apiPurchasePackUnit ?? null);
      const apiUnitsPerPurchasePack =
        typeof row.apiUnitsPerPurchasePack === "number" && row.apiUnitsPerPurchasePack > 0
          ? row.apiUnitsPerPurchasePack
          : null;
      const baseCostPerUnit = computeEffectiveUnitCost(rawUnitCost, apiUnitsPerPurchasePack ?? 1);

      if (row.variantSku) {
        if (!variantMatch) {
          const itemKey = resolveItemKey(row, baseSku);
          if (!itemMatch && itemKey && !itemCreationPlans.has(itemKey)) {
            const name = row.productName ?? baseSku ?? row.variantSku ?? row.sku ?? "Unnamed product";
            itemCreationPlans.set(itemKey, {
              key: itemKey,
              name,
              sku: baseSku,
              defaultWarehouseId: preferredWarehouseId,
              itemKind: DEFAULT_ITEM_KIND,
              cost: baseCostPerUnit,
              purchasePackUnit: apiPurchasePackUnit,
              unitsPerPurchasePack: apiUnitsPerPurchasePack,
            });
          }

          const variantId = row.variantSku.trim();
          const variantKey = `${itemMatch?.id ?? itemKey ?? "missing"}|${variantId}`;
          if (!variantCreationPlans.has(variantKey)) {
            const name = row.variantSku ?? row.productName ?? "Variant";
            const itemKind = itemMatch?.item_kind ?? DEFAULT_ITEM_KIND;
            const unitsForCost = apiUnitsPerPurchasePack ?? resolveUnitsPerPurchasePack(null, itemMatch ?? null);
            const costPerUnit = computeEffectiveUnitCost(rawUnitCost, unitsForCost);
            variantCreationPlans.set(variantKey, {
              key: variantKey,
              itemKey: itemMatch ? null : itemKey,
              itemId: itemMatch?.id ?? null,
              id: variantId,
              name,
              sku: row.variantSku ?? null,
              defaultWarehouseId: preferredWarehouseId,
              itemKind,
              cost: costPerUnit,
              purchasePackUnit: apiPurchasePackUnit,
              unitsPerPurchasePack: apiUnitsPerPurchasePack,
            });
          }
        }
        return;
      }

      if (!itemMatch) {
        const itemKey = resolveItemKey(row, baseSku);
        if (itemKey && !itemCreationPlans.has(itemKey)) {
          const name = row.productName ?? baseSku ?? row.sku ?? "Unnamed product";
          itemCreationPlans.set(itemKey, {
            key: itemKey,
            name,
            sku: baseSku,
            defaultWarehouseId: preferredWarehouseId,
            itemKind: DEFAULT_ITEM_KIND,
            cost: baseCostPerUnit,
            purchasePackUnit: apiPurchasePackUnit,
            unitsPerPurchasePack: apiUnitsPerPurchasePack,
          });
        }
      }
    });

    debugStep = "create-catalog";
    if (!dryRun) {
      if (itemCreationPlans.size) {
        const itemsToCreate = Array.from(itemCreationPlans.values()).map((plan) => ({
          name: plan.name,
          sku: plan.sku,
          item_kind: plan.itemKind,
          consumption_qty_per_base: 1,
          cost: plan.cost ?? undefined,
          purchase_pack_unit: plan.purchasePackUnit ?? "each",
          units_per_purchase_pack: plan.unitsPerPurchasePack ?? 1,
          default_warehouse_id: plan.defaultWarehouseId,
        }));

        const { data, error } = await supabase
          .from("catalog_items")
          .insert(itemsToCreate)
          .select(
            "id,name,default_warehouse_id,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,consumption_qty_per_base,cost"
          );
        if (error) throw error;

        const createdItems = (data as CatalogItemRow[] | null) ?? [];
        createdItems.forEach((row) => {
          if (!row?.id) return;
          itemById.set(row.id, row);
          if (row.sku) itemBySku.set(row.sku, row);
          createdItemIds.add(row.id);
        });

        const createdByKey = new Map<string, CatalogItemRow>();
        createdItems.forEach((row) => {
          const matchKey = row.sku ? `sku:${row.sku}` : row.name ? `name:${row.name}` : null;
          if (matchKey && !createdByKey.has(matchKey)) {
            createdByKey.set(matchKey, row);
          }
        });

        variantCreationPlans.forEach((plan) => {
          if (!plan.itemId && plan.itemKey) {
            const created = createdByKey.get(plan.itemKey);
            if (created) plan.itemId = created.id;
          }
        });
      }

      if (variantCreationPlans.size) {
        const variantsToCreate = Array.from(variantCreationPlans.values())
          .filter((plan) => plan.itemId)
          .map((plan) => ({
            id: plan.id,
            item_id: plan.itemId,
            name: plan.name,
            sku: plan.sku,
            item_kind: plan.itemKind,
            cost: plan.cost ?? undefined,
            purchase_pack_unit: plan.purchasePackUnit ?? "each",
            units_per_purchase_pack: plan.unitsPerPurchasePack ?? 1,
            default_warehouse_id: plan.defaultWarehouseId,
          }));

        if (variantsToCreate.length) {
          const { data, error } = await supabase
            .from("catalog_variants")
            .insert(variantsToCreate)
            .select(
              "id,item_id,name,default_warehouse_id,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,cost"
            );
          if (error) throw error;

          const createdVariants = (data as CatalogVariantRow[] | null) ?? [];
          createdVariants.forEach((row) => {
            if (!row?.id) return;
            variantById.set(row.id, row);
            if (row.sku) variantBySku.set(row.sku, row);
            createdVariantIds.add(row.id);
          });
        }
      }
    }

    debugCounts.createdItems = createdItemIds.size;
    debugCounts.createdVariants = createdVariantIds.size;

    const matchedItems: MatchedMovement[] = movements.map((row) => matchMovement(row));

    const itemIds = Array.from(
      new Set(matchedItems.map((row) => row.itemId).filter((value): value is string => !!value))
    );

    const storageRowsRes = itemIds.length
      ? await supabase
          .from("item_storage_homes")
          .select("item_id,normalized_variant_key,storage_warehouse_id")
          .in("item_id", itemIds)
      : { data: [], error: null };

    if (storageRowsRes.error) throw storageRowsRes.error;
    const storageRows = (storageRowsRes.data as StorageHomeRow[] | null) ?? [];

    const storageMap = new Map<string, string[]>();
    storageRows.forEach((row) => {
      const key = `${row.item_id}|${normalizeVariantKey(row.normalized_variant_key ?? "base")}`;
      const existing = storageMap.get(key) ?? [];
      if (row.storage_warehouse_id && !existing.includes(row.storage_warehouse_id)) {
        existing.push(row.storage_warehouse_id);
      }
      storageMap.set(key, existing);
    });

    const resolvedRows: MatchedMovement[] = matchedItems.map((row) => {
      if (!row.itemId || !row.variantKey) {
        return { ...row, storageWarehouseId: null };
      }
      const storageKey = `${row.itemId}|${normalizeVariantKey(row.variantKey)}`;
      const storageIds = storageMap.get(storageKey) ?? [];
      const warehouseNameKey = normalizeWarehouseName(row.warehouseName ?? null);
      const fallbackWarehouseId = warehouseNameKey
        ? warehouseByName.get(warehouseNameKey)?.id ?? null
        : null;
      const resolvedWarehouseId = createdItemIds.has(row.itemId)
        ? storageIds[0] ?? null
        : row.defaultWarehouseId || storageIds[0] || fallbackWarehouseId || null;
      return { ...row, storageWarehouseId: resolvedWarehouseId };
    });

    const storageWarehouseIds = Array.from(
      new Set(resolvedRows.map((row) => row.storageWarehouseId).filter((value): value is string => !!value))
    );

    debugStep = "load-warehouses";
    const warehouseRowsRes = storageWarehouseIds.length
      ? await supabase.from("warehouses").select("id,name").in("id", storageWarehouseIds)
      : { data: [], error: null };

    if (warehouseRowsRes.error) throw warehouseRowsRes.error;
    const warehouseRows = (warehouseRowsRes.data as WarehouseRow[] | null) ?? [];
    const warehouseNameMap = new Map(warehouseRows.map((row) => [row.id, row.name ?? row.id]));

    debugStep = "load-periods";
    const periodRowsRes = storageWarehouseIds.length
      ? await supabase
          .from("warehouse_stock_periods")
          .select("id,warehouse_id,opened_at,status")
          .in("warehouse_id", storageWarehouseIds)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
      : { data: [], error: null };

    if (periodRowsRes.error) throw periodRowsRes.error;
    const periodRows = (periodRowsRes.data as PeriodRow[] | null) ?? [];
    const openPeriodByWarehouse = new Map<string, string>();
    periodRows.forEach((row) => {
      if (!openPeriodByWarehouse.has(row.warehouse_id)) {
        openPeriodByWarehouse.set(row.warehouse_id, row.id);
      }
    });

    const warehousesWithExistingItems = new Set<string>();
    const warehousesWithNewItems = new Set<string>();
    resolvedRows.forEach((row) => {
      if (!row.storageWarehouseId || !row.itemId) return;
      if (createdItemIds.has(row.itemId)) {
        warehousesWithNewItems.add(row.storageWarehouseId);
      } else {
        warehousesWithExistingItems.add(row.storageWarehouseId);
      }
    });

    const missingOpenWarehouses = storageWarehouseIds.filter((warehouseId) => {
      if (openPeriodByWarehouse.has(warehouseId)) return false;
      if (!warehousesWithNewItems.has(warehouseId)) return false;
      if (warehousesWithExistingItems.has(warehouseId)) return false;
      return true;
    });

    debugCounts.missingOpenWarehouses = missingOpenWarehouses.length;

    debugStep = "auto-open-periods";
    if (!dryRun && stocktakeUserId && missingOpenWarehouses.length) {
      const newPeriods = missingOpenWarehouses.map((warehouseId) => ({
        warehouse_id: warehouseId,
        opened_by: stocktakeUserId,
        status: "open",
        note: "Auto-open from API purchase import",
      }));

      const { data, error } = await supabase
        .from("warehouse_stock_periods")
        .insert(newPeriods)
        .select("id,warehouse_id");
      if (error) throw error;

      (data as { id?: string | null; warehouse_id?: string | null }[] | null)?.forEach((row) => {
        if (row?.id && row?.warehouse_id) {
          openPeriodByWarehouse.set(row.warehouse_id, row.id);
        }
      });
    }

    const periodIds = Array.from(new Set(openPeriodByWarehouse.values()));
    debugCounts.openPeriods = periodIds.length;

    debugStep = "load-openings";
    const openingRowsRes = periodIds.length && itemIds.length
      ? await supabase
          .from("warehouse_stock_counts")
          .select("period_id,item_id,variant_key,kind")
          .in("period_id", periodIds)
          .in("item_id", itemIds)
          .eq("kind", "opening")
      : { data: [], error: null };

    if (openingRowsRes.error) throw openingRowsRes.error;
    const openingRows = (openingRowsRes.data as StockCountRow[] | null) ?? [];
    const openingSet = new Set(
      openingRows.map((row) => `${row.period_id}|${row.item_id}|${normalizeVariantKey(row.variant_key ?? "base")}`)
    );

    debugStep = "insert-openings";
    if (!dryRun && stocktakeUserId) {
      const openingInserts: Record<string, unknown>[] = [];

      resolvedRows.forEach((row) => {
        if (!row.storageWarehouseId || !row.itemId || !row.variantKey) return;
        if (!createdItemIds.has(row.itemId)) return;
        const openPeriodId = openPeriodByWarehouse.get(row.storageWarehouseId) ?? null;
        if (!openPeriodId) return;
        const unitsPerPack =
          typeof row.apiUnitsPerPurchasePack === "number" && row.apiUnitsPerPurchasePack > 0
            ? row.apiUnitsPerPurchasePack
            : typeof row.unitsPerPurchasePack === "number" && row.unitsPerPurchasePack > 0
              ? row.unitsPerPurchasePack
              : 1;
        const effectiveQty = computeEffectiveQty(row.qty, unitsPerPack);
        if (!effectiveQty || effectiveQty <= 0) return;

        const openingKey = `${openPeriodId}|${row.itemId}|${normalizeVariantKey(row.variantKey)}`;
        if (openingSet.has(openingKey)) return;

        openingInserts.push({
          period_id: openPeriodId,
          item_id: row.itemId,
          variant_key: normalizeVariantKey(row.variantKey),
          kind: "opening",
          counted_qty: effectiveQty,
          counted_by: stocktakeUserId,
          context: {
            source: SOURCE,
            movement_id: row.movementId,
            invoice_id: row.invoiceId,
          },
        });
      });

      debugCounts.openingInserts = openingInserts.length;
      if (openingInserts.length) {
        const { error } = await supabase
          .from("warehouse_stock_counts")
          .upsert(openingInserts, { onConflict: "period_id,item_id,variant_key,kind" });
        if (error) throw error;

        openingInserts.forEach((row) => {
          const key = `${row.period_id}|${row.item_id}|${normalizeVariantKey(
            typeof row.variant_key === "string" ? row.variant_key : "base"
          )}`;
          openingSet.add(key);
        });
      }
    }

    debugStep = "load-imports";
    const movementIds = Array.from(
      new Set(resolvedRows.map((row) => row.movementId).filter((value): value is string => !!value))
    );

    const importRowsRes = movementIds.length
      ? await supabase
          .from("warehouse_purchase_imports")
          .select("source_movement_id,receipt_id,status")
          .eq("source", SOURCE)
          .in("source_movement_id", movementIds)
      : { data: [], error: null };

    if (importRowsRes.error) throw importRowsRes.error;
    const importRows = (importRowsRes.data as ImportRow[] | null) ?? [];
    const importMap = new Map(importRows.map((row) => [row.source_movement_id, row]));

    const referenceCodes = Array.from(
      new Set(
        resolvedRows
          .map((row) => row.invoiceId || row.movementId)
          .filter((value): value is string => !!value)
      )
    );

    debugStep = "load-receipts";
    const receiptRowsRes = referenceCodes.length && storageWarehouseIds.length
      ? await supabase
          .from("warehouse_purchase_receipts")
          .select("id,warehouse_id,reference_code")
          .in("reference_code", referenceCodes)
          .in("warehouse_id", storageWarehouseIds)
      : { data: [], error: null };

    if (receiptRowsRes.error) throw receiptRowsRes.error;
    const receiptRows = (receiptRowsRes.data as PurchaseReceiptRow[] | null) ?? [];
    const receiptMap = new Map(
      receiptRows.map((row) => [`${row.warehouse_id}|${row.reference_code}`, row.id])
    );

    const imports: ImportItem[] = resolvedRows.map((row) => {
      const movementId = row.movementId ?? "";
      const referenceCode = row.invoiceId || movementId || null;
      const receiptKey = row.storageWarehouseId && referenceCode
        ? `${row.storageWarehouseId}|${referenceCode}`
        : null;
      const existingImport = movementId ? importMap.get(movementId) : null;
      const existingReceiptId = receiptKey ? receiptMap.get(receiptKey) ?? null : null;
      const unitsPerPack =
        typeof row.apiUnitsPerPurchasePack === "number" && row.apiUnitsPerPurchasePack > 0
          ? row.apiUnitsPerPurchasePack
          : typeof row.unitsPerPurchasePack === "number" && row.unitsPerPurchasePack > 0
            ? row.unitsPerPurchasePack
            : 1;
      const effectiveQty = computeEffectiveQty(row.qty, unitsPerPack);
      const rawUnitCost = row.unitCost ?? (row.totalCost && row.qty ? row.totalCost / row.qty : null);
      const effectiveUnitCost = computeEffectiveUnitCost(rawUnitCost, unitsPerPack);
      const qtyValid = typeof effectiveQty === "number" && effectiveQty > 0;

      const openPeriodId = row.storageWarehouseId
        ? openPeriodByWarehouse.get(row.storageWarehouseId) ?? null
        : null;
      const openingKey = openPeriodId && row.itemId && row.variantKey
        ? `${openPeriodId}|${row.itemId}|${normalizeVariantKey(row.variantKey)}`
        : null;
      const hasOpening = openingKey ? openingSet.has(openingKey) : false;
      const createdItem = row.itemId ? createdItemIds.has(row.itemId) : false;
      const createdVariant = row.variantId ? createdVariantIds.has(row.variantId) : false;

      let status: ImportStatus = "ready";
      let statusMessage: string | null = null;

      if (existingImport) {
        status = "duplicate";
        statusMessage = "Movement already imported.";
      } else if (existingReceiptId) {
        status = "duplicate_receipt";
        statusMessage = "Invoice already posted for this warehouse.";
      } else if (!row.itemId) {
        status = "missing_item";
        statusMessage = "No catalog item or variant found.";
      } else if (!row.storageWarehouseId) {
        status = "missing_storage_home";
        statusMessage = "Storage home is not configured.";
      } else if (!openPeriodId) {
        status = "missing_open_period";
        statusMessage = stocktakeUserId
          ? createdItem
            ? "No open stock period for new item."
            : "No open stock period for storage home."
          : "No open stock period for storage home (stocktake user id missing).";
      } else if (!hasOpening) {
        status = "missing_opening_stock";
        statusMessage = stocktakeUserId
          ? createdItem
            ? "Opening stock not recorded for new item."
            : "Opening stock not recorded yet."
          : "Opening stock missing (stocktake user id missing).";
      } else if (!qtyValid) {
        status = "invalid_qty";
        statusMessage = "Quantity must be greater than zero.";
      }

      return {
        movement_id: movementId,
        lot_id: row.lotId ?? null,
        product_id: row.productId ?? null,
        product_name: row.productName ?? null,
        item_sku: row.itemSku ?? null,
        variant_sku: row.variantSku ?? null,
        sku: row.variantSku ?? row.itemSku ?? row.sku ?? null,
        qty: effectiveQty,
        unit_cost: effectiveUnitCost,
        total_cost:
          row.totalCost ?? (effectiveUnitCost && effectiveQty ? effectiveUnitCost * effectiveQty : null),
        movement_at: row.movementAt ?? null,
        invoice_id: row.invoiceId ?? null,
        operator_name: row.operatorName ?? null,
        api_warehouse_id: row.warehouseId ?? null,
        api_warehouse_name: row.warehouseName ?? null,
        item_id: row.itemId ?? null,
        item_name: row.itemName ?? null,
        variant_key: row.variantKey ?? null,
        variant_name: row.variantName ?? null,
        storage_warehouse_id: row.storageWarehouseId ?? null,
        storage_warehouse_name: row.storageWarehouseId
          ? warehouseNameMap.get(row.storageWarehouseId) ?? row.storageWarehouseId
          : null,
        receipt_reference: referenceCode,
        receipt_id: existingImport?.receipt_id ?? existingReceiptId ?? null,
        status,
        status_message: statusMessage,
        created_item: createdItem,
        created_variant: createdVariant,
      };
    });

    debugStep = "upsert-updates";
    if (!dryRun) {
      const itemUpdates = new Map<string, Record<string, unknown>>();
      const variantUpdates = new Map<string, Record<string, unknown>>();

      resolvedRows.forEach((row, index) => {
        const importRow = imports[index];
        if (!importRow) return;
        if (importRow.status !== "ready" && importRow.status !== "imported") return;

        const apiPackUnit = normalizePackUnit(row.apiPurchasePackUnit ?? null);
        const apiUnitsPerPack =
          typeof row.apiUnitsPerPurchasePack === "number" && row.apiUnitsPerPurchasePack > 0
            ? row.apiUnitsPerPurchasePack
            : null;

        if (row.variantId) {
          const updates = variantUpdates.get(row.variantId) ?? { id: row.variantId };
          const existingUnits =
            typeof row.unitsPerPurchasePack === "number" ? row.unitsPerPurchasePack : null;

          if (importRow.unit_cost !== null && importRow.unit_cost !== undefined) {
            updates.cost = importRow.unit_cost;
          }

          if (apiPackUnit && normalizePackUnit(row.purchasePackUnit ?? null)?.toLowerCase() !== apiPackUnit.toLowerCase()) {
            updates.purchase_pack_unit = apiPackUnit;
          }

          if (apiUnitsPerPack !== null && existingUnits !== apiUnitsPerPack) {
            updates.units_per_purchase_pack = apiUnitsPerPack;
          }

          if (Object.keys(updates).length > 1) {
            updates.updated_at = new Date().toISOString();
            variantUpdates.set(row.variantId, updates);
          }
          return;
        }

        if (row.itemId) {
          const updates = itemUpdates.get(row.itemId) ?? { id: row.itemId };
          const existingUnits =
            typeof row.unitsPerPurchasePack === "number" ? row.unitsPerPurchasePack : null;

          if (importRow.unit_cost !== null && importRow.unit_cost !== undefined) {
            updates.cost = importRow.unit_cost;
          }

          if (apiPackUnit && normalizePackUnit(row.purchasePackUnit ?? null)?.toLowerCase() !== apiPackUnit.toLowerCase()) {
            updates.purchase_pack_unit = apiPackUnit;
          }

          if (apiUnitsPerPack !== null && existingUnits !== apiUnitsPerPack) {
            updates.units_per_purchase_pack = apiUnitsPerPack;
          }

          if (Object.keys(updates).length > 1) {
            updates.updated_at = new Date().toISOString();
            itemUpdates.set(row.itemId, updates);
          }
        }
      });

      if (itemUpdates.size) {
        const updates = Array.from(itemUpdates.values());
        const { error } = await supabase
          .from("catalog_items")
          .upsert(updates, { onConflict: "id" });
        if (error) throw error;
      }

      if (variantUpdates.size) {
        const updates = Array.from(variantUpdates.values());
        const { error } = await supabase
          .from("catalog_variants")
          .upsert(updates, { onConflict: "id" });
        if (error) throw error;
      }
    }

    const importRowsToUpsert: Record<string, unknown>[] = [];

    const groups = new Map<string, ImportItem[]>();
    imports.forEach((row) => {
      if (row.status !== "ready") {
        if (row.status === "duplicate_receipt" && row.movement_id && row.receipt_id) {
          importRowsToUpsert.push({
            source: SOURCE,
            source_movement_id: row.movement_id,
            source_invoice_id: row.invoice_id,
            warehouse_id: row.storage_warehouse_id,
            item_id: row.item_id,
            variant_key: row.variant_key ?? "base",
            qty_units: row.qty,
            unit_cost: row.unit_cost,
            movement_at: row.movement_at,
            receipt_id: row.receipt_id,
            status: "existing_receipt",
            updated_at: new Date().toISOString(),
          });
        }
        return;
      }

      const reference = row.receipt_reference ?? row.movement_id;
      const warehouseId = row.storage_warehouse_id ?? "";
      const key = `${warehouseId}|${reference}`;
      const existing = groups.get(key) ?? [];
      existing.push(row);
      groups.set(key, existing);
    });

    debugStep = "record-receipts";
    if (!dryRun) {
      for (const [groupKey, rows] of groups.entries()) {
        const [warehouseId, referenceCode] = groupKey.split("|");
        const payloadItems = rows.map((row) => ({
          product_id: row.item_id,
          variant_key: row.variant_key ?? "base",
          qty: row.qty,
          qty_input_mode: "units",
          unit_cost: row.unit_cost,
        }));

        try {
          const { data, error } = await supabase.rpc("record_purchase_receipt", {
            p_warehouse_id: warehouseId,
            p_supplier_id: null,
            p_reference_code: referenceCode,
            p_items: payloadItems,
            p_note: "API import: Afterten stock movements",
            p_auto_whatsapp: false,
          });
          if (error) throw error;

          const receiptId = (data as { id?: string | null })?.id ?? null;
          rows.forEach((row) => {
            row.status = "imported";
            row.receipt_id = receiptId;
            row.status_message = "Imported successfully.";
          });

          rows.forEach((row) => {
            if (!row.movement_id) return;
            importRowsToUpsert.push({
              source: SOURCE,
              source_movement_id: row.movement_id,
              source_invoice_id: row.invoice_id,
              warehouse_id: row.storage_warehouse_id,
              item_id: row.item_id,
              variant_key: row.variant_key ?? "base",
              qty_units: row.qty,
              unit_cost: row.unit_cost,
              movement_at: row.movement_at,
              receipt_id: receiptId,
              status: "imported",
              updated_at: new Date().toISOString(),
            });
          });
        } catch (error) {
          rows.forEach((row) => {
            row.status = "error";
            row.status_message =
              error instanceof Error ? error.message : "Failed to record purchase";
          });
        }
      }

      debugCounts.importRows = importRowsToUpsert.length;
      if (importRowsToUpsert.length) {
        const { error } = await supabase
          .from("warehouse_purchase_imports")
          .upsert(importRowsToUpsert, { onConflict: "source,source_movement_id" });
        if (error) throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      summary: buildSummary(imports),
      items: imports,
      debug: debugEnabled ? { step: debugStep, env: debugEnv, counts: debugCounts } : undefined,
    });
  } catch (error) {
    console.error("warehouse purchase import failed", error);
    const message = error instanceof Error ? error.message : String(error);
    const showDetails = process.env.NODE_ENV !== "production" || debugEnabled;
    const details = showDetails ? { step: debugStep, message } : undefined;
    return NextResponse.json(
      { ok: false, error: "Unable to import purchase movements", details },
      { status: 500 }
    );
  }
}
