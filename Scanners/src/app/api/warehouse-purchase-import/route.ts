import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const SOURCE = "afterten_stock_api";
const API_BASE_URL = "https://afterten-stock-api-896827614552.us-central1.run.app";
const API_PATH = "/stock/movements?type=receive";

type ApiMovementRaw = {
  _id?: string | null;
  lotId?: string | null;
  productId?: string | null;
  productName?: string | null;
  sku?: string | null;
  variantSku?: string | null;
  itemSku?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  outletId?: string | null;
  type?: string | null;
  qty?: number | string | null;
  unitCost?: number | string | null;
  totalCost?: number | string | null;
  balanceAfter?: number | string | null;
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
};

type CatalogItemRow = {
  id: string;
  name: string | null;
  default_warehouse_id: string | null;
  active: boolean | null;
  sku: string | null;
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
  variantKey: string | null;
  variantName: string | null;
  defaultWarehouseId: string | null;
  storageWarehouseId?: string | null;
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
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const token = process.env.Afterten_Purchases_Api_Token?.trim();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Afterten_Purchases_Api_Token is missing" },
        { status: 500 }
      );
    }

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

    const payload = await response.json().catch(() => ({}));
    const rawItems: ApiMovementRaw[] = Array.isArray(payload?.items) ? payload.items : [];

    const movements = rawItems.map((item) => {
      const qty = cleanNumber(item.qty);
      const unitCost = cleanNumber(item.unitCost);
      const totalCost = cleanNumber(item.totalCost);
      return {
        movementId: cleanText(item._id),
        lotId: cleanText(item.lotId),
        productId: cleanText(item.productId),
        productName: cleanText(item.productName),
        sku: cleanText(item.sku),
        variantSku: cleanText(item.variantSku),
        itemSku: cleanText(item.itemSku),
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

    const supabase = getServiceClient();

    const [variantByIdRes, variantBySkuRes] = await Promise.all([
      productIds.length
        ? supabase
            .from("catalog_variants")
            .select("id,item_id,name,default_warehouse_id,active,sku")
            .in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      skuList.length
        ? supabase
            .from("catalog_variants")
            .select("id,item_id,name,default_warehouse_id,active,sku")
            .in("sku", skuList)
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

    const [itemByIdRes, itemBySkuRes] = await Promise.all([
      itemIdsToFetch.length
        ? supabase
            .from("catalog_items")
            .select("id,name,default_warehouse_id,active,sku")
            .in("id", itemIdsToFetch)
        : Promise.resolve({ data: [], error: null }),
      skuList.length
        ? supabase
            .from("catalog_items")
            .select("id,name,default_warehouse_id,active,sku")
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

    const matchedItems: MatchedMovement[] = movements.map((row) => {
      const variantMatch =
        (row.productId ? variantById.get(row.productId) : undefined) ||
        (row.variantSku ? variantBySku.get(row.variantSku) : undefined) ||
        (row.sku ? variantBySku.get(row.sku) : undefined);
      const itemMatch =
        (row.productId ? itemById.get(row.productId) : undefined) ||
        (row.itemSku ? itemBySku.get(row.itemSku) : undefined) ||
        (row.sku ? itemBySku.get(row.sku) : undefined);

      if (variantMatch) {
        const parentItem = itemById.get(variantMatch.item_id) ?? null;
        return {
          ...row,
          itemId: variantMatch.item_id,
          itemName: parentItem?.name ?? row.productName ?? null,
          variantKey: normalizeVariantKey(variantMatch.id),
          variantName: variantMatch.name ?? null,
          defaultWarehouseId: variantMatch.default_warehouse_id ?? parentItem?.default_warehouse_id ?? null,
        };
      }

      if (itemMatch) {
        return {
          ...row,
          itemId: itemMatch.id,
          itemName: itemMatch.name ?? row.productName ?? null,
          variantKey: "base",
          variantName: null,
          defaultWarehouseId: itemMatch.default_warehouse_id ?? null,
        };
      }

      return {
        ...row,
        itemId: null,
        itemName: row.productName ?? null,
        variantKey: null,
        variantName: null,
        defaultWarehouseId: null,
      };
    });

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
      const resolvedWarehouseId = row.defaultWarehouseId || storageIds[0] || null;
      return { ...row, storageWarehouseId: resolvedWarehouseId };
    });

    const storageWarehouseIds = Array.from(
      new Set(resolvedRows.map((row) => row.storageWarehouseId).filter((value): value is string => !!value))
    );

    const warehouseRowsRes = storageWarehouseIds.length
      ? await supabase.from("warehouses").select("id,name").in("id", storageWarehouseIds)
      : { data: [], error: null };

    if (warehouseRowsRes.error) throw warehouseRowsRes.error;
    const warehouseRows = (warehouseRowsRes.data as WarehouseRow[] | null) ?? [];
    const warehouseNameMap = new Map(warehouseRows.map((row) => [row.id, row.name ?? row.id]));

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

    const periodIds = Array.from(new Set(openPeriodByWarehouse.values()));

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
      const qtyValid = typeof row.qty === "number" && row.qty > 0;

      const openPeriodId = row.storageWarehouseId
        ? openPeriodByWarehouse.get(row.storageWarehouseId) ?? null
        : null;
      const openingKey = openPeriodId && row.itemId && row.variantKey
        ? `${openPeriodId}|${row.itemId}|${normalizeVariantKey(row.variantKey)}`
        : null;
      const hasOpening = openingKey ? openingSet.has(openingKey) : false;

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
        statusMessage = "No open stock period for storage home.";
      } else if (!hasOpening) {
        status = "missing_opening_stock";
        statusMessage = "Opening stock not recorded yet.";
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
        qty: row.qty,
        unit_cost: row.unitCost ?? (row.totalCost && row.qty ? row.totalCost / row.qty : null),
        total_cost: row.totalCost ?? null,
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
      };
    });

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
    });
  } catch (error) {
    console.error("warehouse purchase import failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to import purchase movements" },
      { status: 500 }
    );
  }
}
