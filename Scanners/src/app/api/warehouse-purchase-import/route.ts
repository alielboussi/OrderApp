import { NextRequest, NextResponse } from "next/server";
import { fetchReceiveMovements, resolvePurchasesApiToken } from "@/lib/afterten-stock-api";
import { getServiceClient } from "@/lib/supabase-server";
import { isMissingRelationError } from "@/lib/supabase-errors";

const CATALOG_VARIANT_SELECT =
  "id,item_id,name,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,cost";
const CATALOG_ITEM_SELECT =
  "id,name,active,sku,item_kind,units_per_purchase_pack,purchase_pack_unit,consumption_uom,consumption_qty_per_base,cost";

const SHARED_WAREHOUSE_ALIASES = ["till 1", "till 2", "till 1 & 2 warehouse"];

const SOURCE = "afterten_stock_api";
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
  supplier?: {
    _id?: string | null;
    id?: string | null;
    name?: string | null;
    contactName?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    contact_phone?: string | null;
    email?: string | null;
    contact_email?: string | null;
    whatsapp?: string | null;
    whatsapp_number?: string | null;
  } | null;
  supplierName?: string | null;
  supplier_name?: string | null;
  supplierId?: string | null;
  vendorName?: string | null;
  vendor_name?: string | null;
  fromSupplier?: string | null;
  at?: string | null;
};

type CatalogVariantRow = {
  id: string;
  item_id: string;
  name: string | null;
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
  active: boolean | null;
  sku: string | null;
  item_kind: string | null;
  units_per_purchase_pack: number | null;
  purchase_pack_unit: string | null;
  consumption_uom: string | null;
  consumption_qty_per_base: number | null;
  cost: number | null;
};

type WarehouseRow = { id: string; name: string | null; outlet_id?: string | null };

type OutletWarehouseRow = {
  outlet_id: string;
  warehouse_id: string;
  outlets:
    | { name: string | null; code: string | null }
    | { name: string | null; code: string | null }[]
    | null;
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
  | "missing_warehouse"
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
  supplierName: string | null;
  itemId: string | null;
  itemName: string | null;
  variantId?: string | null;
  variantKey: string | null;
  variantName: string | null;
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
  supplier_id: string | null;
  supplier_name: string | null;
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
  missing_warehouse: number;
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

function normalizeNameKey(value?: string | null): string | null {
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

type SupplierFromApi = {
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_number: string | null;
  external_id: string | null;
};

function readSupplierFromMovement(raw: Record<string, unknown>): SupplierFromApi | null {
  const nested =
    raw.supplier && typeof raw.supplier === "object"
      ? (raw.supplier as Record<string, unknown>)
      : raw.vendor && typeof raw.vendor === "object"
        ? (raw.vendor as Record<string, unknown>)
        : null;

  const name =
    cleanText(nested?.name) ??
    cleanText(raw.supplierName) ??
    cleanText(raw.supplier_name) ??
    cleanText(raw.vendorName) ??
    cleanText(raw.vendor_name) ??
    cleanText(raw.fromSupplier);

  if (!name) return null;

  return {
    name,
    contact_name: cleanText(nested?.contactName) ?? cleanText(nested?.contact_name) ?? null,
    contact_phone: cleanText(nested?.phone) ?? cleanText(nested?.contact_phone) ?? null,
    contact_email: cleanText(nested?.email) ?? cleanText(nested?.contact_email) ?? null,
    whatsapp_number: cleanText(nested?.whatsapp) ?? cleanText(nested?.whatsapp_number) ?? null,
    external_id:
      cleanText(nested?._id) ??
      cleanText(nested?.id) ??
      cleanText(raw.supplierId) ??
      cleanText(raw.supplier_id) ??
      null,
  };
}

async function ensureSuppliersFromApi(
  supabase: ReturnType<typeof getServiceClient>,
  suppliers: SupplierFromApi[],
  dryRun: boolean,
): Promise<Map<string, string>> {
  const uniqueByName = new Map<string, SupplierFromApi>();
  for (const supplier of suppliers) {
    const key = normalizeNameKey(supplier.name);
    if (!key || uniqueByName.has(key)) continue;
    uniqueByName.set(key, supplier);
  }

  const { data: existingRows, error: existingError } = await supabase.from("suppliers").select("id,name");
  if (existingError) throw existingError;

  const idByNameKey = new Map<string, string>();
  (existingRows ?? []).forEach((row) => {
    const key = normalizeNameKey(row.name);
    if (key && row.id) idByNameKey.set(key, row.id);
  });

  if (dryRun) return idByNameKey;

  for (const [nameKey, supplier] of uniqueByName.entries()) {
    if (idByNameKey.has(nameKey)) continue;

    const notes = supplier.external_id ? `stock-api:${supplier.external_id}` : null;
    const { data: created, error } = await supabase
      .from("suppliers")
      .insert({
        name: supplier.name,
        contact_name: supplier.contact_name,
        contact_phone: supplier.contact_phone,
        contact_email: supplier.contact_email,
        whatsapp_number: supplier.whatsapp_number,
        notes,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;
    if (created?.id) idByNameKey.set(nameKey, created.id);
  }

  return idByNameKey;
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
    missing_warehouse: 0,
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
      case "missing_warehouse":
        summary.missing_warehouse += 1;
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

    const token = resolvePurchasesApiToken(req.headers.get("x-afterten-token"));
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Afterten_Purchases_Api_Token is missing" },
        { status: 500 }
      );
    }

    const debugToken = process.env.Afterten_Debug_Token?.trim();
    const headerDebug = req.headers.get("x-afterten-debug")?.trim();
    debugEnabled = Boolean(debugToken && headerDebug && headerDebug === debugToken);
    debugEnv = debugEnabled
      ? {
          hasPurchaseToken: Boolean(process.env.Afterten_Purchases_Api_Token?.trim()),
          hasSupabaseUrl: Boolean(process.env.SUPABASE_URL?.trim()),
          hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
        }
      : undefined;

    debugStep = "fetch-api";
    let rawItems: ApiMovementRaw[];
    try {
      rawItems = (await fetchReceiveMovements(token)) as ApiMovementRaw[];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stock API request failed";
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }

    debugCounts.movements = rawItems.length;

    debugStep = "normalize-movements";
    const movements = rawItems.map((item) => {
      const qty = cleanNumber(item.qty);
      const unitCost = cleanNumber(item.unitCost);
      const totalCost = cleanNumber(item.totalCost);
      const apiPurchasePackUnit = readPurchasePackUnit(item as Record<string, unknown>);
      const apiUnitsPerPurchasePack = readUnitsPerPurchasePack(item as Record<string, unknown>);
      const supplier = readSupplierFromMovement(item as Record<string, unknown>);
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
        supplierName: supplier?.name ?? null,
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
    const nameList = Array.from(
      new Set(movements.map((row) => row.productName).filter((value): value is string => !!value))
    );

    debugCounts.productIds = productIds.length;
    debugCounts.skuList = skuList.length;
    debugCounts.warehouseNames = warehouseNames.length;
    debugCounts.nameList = nameList.length;

    const supabase = getServiceClient();

    debugStep = "load-warehouse-directory";
    const [allWarehousesRes, outletWarehousesRes] = await Promise.all([
      supabase.from("warehouses").select("id,name,outlet_id").eq("active", true),
      supabase.from("outlet_warehouses").select("outlet_id,warehouse_id,outlets(name,code)"),
    ]);

    if (allWarehousesRes.error && !isMissingRelationError(allWarehousesRes.error, "warehouses")) {
      throw allWarehousesRes.error;
    }
    if (
      outletWarehousesRes.error &&
      !isMissingRelationError(outletWarehousesRes.error, "outlet_warehouses")
    ) {
      throw outletWarehousesRes.error;
    }

    const warehouseByName = new Map<string, WarehouseRow>();
    ((allWarehousesRes.data as WarehouseRow[] | null) ?? []).forEach((row) => {
      const key = normalizeWarehouseName(row.name ?? null);
      if (key) warehouseByName.set(key, row);
    });

    const sharedWarehouse =
      warehouseByName.get(normalizeWarehouseName("Till 1 & 2 Warehouse") ?? "") ??
      Array.from(warehouseByName.values()).find((row) =>
        (row.name ?? "").toLowerCase().includes("till 1") && (row.name ?? "").toLowerCase().includes("2")
      );
    if (sharedWarehouse?.id) {
      for (const alias of SHARED_WAREHOUSE_ALIASES) {
        warehouseByName.set(alias, sharedWarehouse);
      }
    }

    const outletFirstWarehouse = new Map<string, string>();
    const outletByNameKey = new Map<string, string>();
    ((outletWarehousesRes.data as OutletWarehouseRow[] | null) ?? []).forEach((row) => {
      if (!outletFirstWarehouse.has(row.outlet_id)) {
        outletFirstWarehouse.set(row.outlet_id, row.warehouse_id);
      }
      const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
      const nameKey = normalizeWarehouseName(outlet?.name ?? null);
      const codeKey = normalizeWarehouseName(outlet?.code ?? null);
      if (nameKey) outletByNameKey.set(nameKey, row.outlet_id);
      if (codeKey) outletByNameKey.set(codeKey, row.outlet_id);
      if (nameKey && !warehouseByName.has(nameKey)) {
        warehouseByName.set(nameKey, { id: row.warehouse_id, name: outlet?.name ?? null });
      }
    });

    const resolveWarehouseId = (warehouseName: string | null): string | null => {
      const key = normalizeWarehouseName(warehouseName);
      if (!key) return null;
      const direct = warehouseByName.get(key);
      if (direct?.id) return direct.id;
      const outletId = outletByNameKey.get(key);
      if (outletId) return outletFirstWarehouse.get(outletId) ?? null;
      return null;
    };

    debugStep = "load-catalog";
    const [variantByIdRes, variantBySkuRes] = await Promise.all([
      productIds.length
        ? supabase.from("catalog_variants").select(CATALOG_VARIANT_SELECT).in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      skuList.length
        ? supabase.from("catalog_variants").select(CATALOG_VARIANT_SELECT).in("sku", skuList)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (variantByIdRes.error) throw variantByIdRes.error;
    if (variantBySkuRes.error) throw variantBySkuRes.error;

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

    const [itemByIdRes, itemBySkuRes, itemByNameRes] = await Promise.all([
      itemIdsToFetch.length
        ? supabase.from("catalog_items").select(CATALOG_ITEM_SELECT).in("id", itemIdsToFetch)
        : Promise.resolve({ data: [], error: null }),
      skuList.length
        ? supabase.from("catalog_items").select(CATALOG_ITEM_SELECT).in("sku", skuList)
        : Promise.resolve({ data: [], error: null }),
      nameList.length
        ? supabase.from("catalog_items").select(CATALOG_ITEM_SELECT).in("name", nameList)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (itemByIdRes.error) throw itemByIdRes.error;
    if (itemBySkuRes.error) throw itemBySkuRes.error;
    if (itemByNameRes.error) throw itemByNameRes.error;

    const itemRows = [
      ...((itemByIdRes.data as CatalogItemRow[] | null) ?? []),
      ...((itemBySkuRes.data as CatalogItemRow[] | null) ?? []),
    ].filter((row) => row?.id);

    const itemById = new Map<string, CatalogItemRow>();
    const itemBySku = new Map<string, CatalogItemRow>();
    const existingNameSet = new Set<string>();
    itemRows.forEach((row) => {
      if (row.active === false) return;
      itemById.set(row.id, row);
      if (row.sku) itemBySku.set(row.sku, row);
    });

    ((itemByNameRes.data as CatalogItemRow[] | null) ?? []).forEach((row) => {
      const nameKey = normalizeNameKey(row?.name ?? null);
      if (nameKey) existingNameSet.add(nameKey);
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
      const nameKey = normalizeNameKey(row.productName ?? null);
      if (nameKey) return `name:${nameKey}`;
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
            const nameKey = normalizeNameKey(name);
            if (!nameKey || !existingNameSet.has(nameKey)) {
              itemCreationPlans.set(itemKey, {
                key: itemKey,
                name,
                sku: baseSku,
                itemKind: DEFAULT_ITEM_KIND,
                cost: baseCostPerUnit,
                purchasePackUnit: apiPurchasePackUnit,
                unitsPerPurchasePack: apiUnitsPerPurchasePack,
              });
            }
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
          const nameKey = normalizeNameKey(name);
          if (!nameKey || !existingNameSet.has(nameKey)) {
            itemCreationPlans.set(itemKey, {
              key: itemKey,
              name,
              sku: baseSku,
              itemKind: DEFAULT_ITEM_KIND,
              cost: baseCostPerUnit,
              purchasePackUnit: apiPurchasePackUnit,
              unitsPerPurchasePack: apiUnitsPerPurchasePack,
            });
          }
        }
      }
    });

    debugStep = "create-catalog";
    if (!dryRun) {
      if (itemCreationPlans.size) {
        debugStep = "create-catalog-items";
        const itemsToCreate = Array.from(itemCreationPlans.values()).map((plan) => ({
          name: plan.name,
          sku: plan.sku,
          item_kind: plan.itemKind,
          consumption_qty_per_base: 1,
          cost: plan.cost ?? undefined,
          purchase_pack_unit: plan.purchasePackUnit ?? "each",
          units_per_purchase_pack: plan.unitsPerPurchasePack ?? 1,
        }));

        const { data, error } = await supabase
          .from("catalog_items")
          .insert(itemsToCreate)
          .select(CATALOG_ITEM_SELECT);
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
          const nameKey = normalizeNameKey(row.name ?? null);
          const matchKey = row.sku ? `sku:${row.sku}` : nameKey ? `name:${nameKey}` : null;
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
        debugStep = "create-catalog-variants";
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
          }));

        if (variantsToCreate.length) {
          const { data, error } = await supabase
            .from("catalog_variants")
            .insert(variantsToCreate)
            .select(CATALOG_VARIANT_SELECT);
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

    const resolvedRows: MatchedMovement[] = matchedItems.map((row) => ({
      ...row,
      storageWarehouseId: resolveWarehouseId(row.warehouseName),
    }));

    const storageWarehouseIds = Array.from(
      new Set(resolvedRows.map((row) => row.storageWarehouseId).filter((value): value is string => !!value))
    );

    debugStep = "load-warehouses";
    const warehouseRowsRes = storageWarehouseIds.length
      ? await supabase.from("warehouses").select("id,name").in("id", storageWarehouseIds)
      : { data: [], error: null };

    if (warehouseRowsRes.error && !isMissingRelationError(warehouseRowsRes.error, "warehouses")) {
      throw warehouseRowsRes.error;
    }
    const warehouseRows = (warehouseRowsRes.data as WarehouseRow[] | null) ?? [];
    const warehouseNameMap = new Map(warehouseRows.map((row) => [row.id, row.name ?? row.id]));

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

    if (importRowsRes.error) {
      if (isMissingRelationError(importRowsRes.error, "warehouse_purchase_imports")) {
        return NextResponse.json({
          ok: true,
          summary: buildSummary([]),
          items: [],
          warning: "warehouse_purchase_imports missing — run supabase/scripts/recreate_warehouse_purchases.sql",
        });
      }
      throw importRowsRes.error;
    }
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

    const supplierCandidates = rawItems
      .map((item) => readSupplierFromMovement(item as Record<string, unknown>))
      .filter((row): row is SupplierFromApi => Boolean(row));

    debugStep = "sync-suppliers";
    const supplierIdByNameKey = await ensureSuppliersFromApi(supabase, supplierCandidates, dryRun);

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

      const createdItem = row.itemId ? createdItemIds.has(row.itemId) : false;
      const createdVariant = row.variantId ? createdVariantIds.has(row.variantId) : false;
      const supplierNameKey = normalizeNameKey(row.supplierName);
      const supplierId = supplierNameKey ? supplierIdByNameKey.get(supplierNameKey) ?? null : null;

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
        status = "missing_warehouse";
        statusMessage = "No warehouse matched for this movement (check outlet/warehouse names).";
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
        supplier_id: supplierId,
        supplier_name: row.supplierName ?? null,
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
        for (const update of updates) {
          const { id, ...changes } = update;
          const { error } = await supabase
            .from("catalog_items")
            .update(changes)
            .eq("id", id);
          if (error) throw error;
        }
      }

      if (variantUpdates.size) {
        const updates = Array.from(variantUpdates.values());
        for (const update of updates) {
          const { id, ...changes } = update;
          const { error } = await supabase
            .from("catalog_variants")
            .update(changes)
            .eq("id", id);
          if (error) throw error;
        }
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
        const supplierId = rows.find((row) => row.supplier_id)?.supplier_id ?? null;
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
            p_supplier_id: supplierId,
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
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === "object") {
      const candidate = error as Record<string, unknown>;
      message =
        (typeof candidate.message === "string" && candidate.message) ||
        (typeof candidate.details === "string" && candidate.details) ||
        (typeof candidate.hint === "string" && candidate.hint) ||
        JSON.stringify(candidate);
    } else {
      message = String(error);
    }
    const showDetails = process.env.NODE_ENV !== "production" || debugEnabled;
    const details = showDetails
      ? {
          step: debugStep,
          message,
          env: debugEnv,
          counts: debugCounts,
        }
      : undefined;
    return NextResponse.json(
      { ok: false, error: "Unable to import purchase movements", details },
      { status: 500 }
    );
  }
}
