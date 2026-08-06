import { NextResponse } from "next/server";
import {
  ITEM_TRACKED_FIELDS,
  parseCatalogChangeActor,
  recordCatalogChange,
} from "@/lib/catalog-change-events";
import { allocateFirestorePosItemSku } from "@/lib/firestore-pos-catalog-ids";
import {
  buildStorageHomeIds,
  createFirestoreCatalogItem,
  deleteFirestoreCatalogItem,
  enrichFirestoreItems,
  getFirestoreCatalogItem,
  listFirestoreCatalogItems,
  syncFirestoreBaseStorageHomes,
  updateFirestoreCatalogItem,
} from "@/lib/firestore-catalog-store";
import { refreshOutletOrderCatalogForItem } from "@/lib/firestore-outlet-catalog-access";

function scheduleOutletOrderCatalogRefresh(itemId: string) {
  void refreshOutletOrderCatalogForItem(itemId).catch((error) => {
    console.error("Failed to refresh outlet order catalog", error);
  });
}

const ITEM_KINDS = ["finished", "ingredient", "raw"] as const;
type ItemKind = (typeof ITEM_KINDS)[number];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function cleanUuid(value: unknown): string | null {
  return isUuid(value) ? value.trim() : null;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function pickItemKind(value: unknown): ItemKind | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "product") return "finished";
  if (ITEM_KINDS.includes(trimmed as ItemKind)) return trimmed as ItemKind;
  return null;
}

function normalizeStorageHomeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanUuid).filter((id): id is string => Boolean(id));
}

function hasStorageHomePayload(body: Record<string, unknown>): boolean {
  return (
    body.storage_home_id !== undefined ||
    body.default_warehouse_id !== undefined ||
    body.storage_home_ids !== undefined
  );
}

function buildItemPayload(body: Record<string, unknown>) {
  const name = cleanText(body.name);
  if (!name) return { error: "Name is required" as const };

  const itemKind = pickItemKind(body.item_kind);
  if (!itemKind) return { error: "item_kind must be 'finished', 'ingredient', or 'raw'" as const };

  const consumptionUnit = cleanText(body.consumption_unit) ?? cleanText(body.consumption_uom) ?? "each";
  const cost = toNumber(body.cost ?? 0, 0);
  const sellingPrice = toNumber(body.selling_price ?? 0, 0);
  const ordersAppCostPrice = toNumber(body.orders_app_cost_price ?? sellingPrice ?? 0, 0);
  if (cost === null || sellingPrice === null || ordersAppCostPrice === null) {
    return { error: "Value must be numeric" as const };
  }

  const storagePayload = hasStorageHomePayload(body);
  const requestedStorageHomeId = storagePayload
    ? cleanUuid(body.storage_home_id) ?? cleanUuid(body.default_warehouse_id)
    : null;
  const requestedStorageHomeIds = storagePayload ? normalizeStorageHomeIds(body.storage_home_ids) : [];
  const defaultWarehouseId = storagePayload
    ? requestedStorageHomeId ?? requestedStorageHomeIds[0] ?? null
    : null;
  const resolvedStorageHomeIds = storagePayload
    ? buildStorageHomeIds(defaultWarehouseId, requestedStorageHomeIds)
    : [];

  const menuGroupId = itemKind === "finished" ? cleanUuid(body.menu_group_id) : null;

  return {
    payload: {
      name,
      sku: cleanText(body.sku) ?? null,
      supplier_sku: cleanText(body.supplier_sku) ?? null,
      item_kind: itemKind,
      consumption_unit: consumptionUnit,
      consumption_uom: consumptionUnit,
      storage_unit: cleanText(body.storage_unit) ?? null,
      storage_weight: body.storage_weight != null && `${body.storage_weight}`.trim() !== "" ? toNumber(body.storage_weight, 0) : null,
      cost,
      selling_price: sellingPrice,
      orders_app_uom: cleanText(body.orders_app_uom) ?? consumptionUnit,
      orders_app_cost_price: ordersAppCostPrice,
      has_variations: cleanBoolean(body.has_variations, false),
      has_recipe: cleanBoolean(body.has_recipe, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: defaultWarehouseId,
      menu_group_id: menuGroupId,
      active: cleanBoolean(body.active, true),
      purchase_pack_unit: cleanText(body.purchase_pack_unit) ?? consumptionUnit,
      units_per_purchase_pack: toNumber(body.units_per_purchase_pack, 1) ?? 1,
      transfer_unit: cleanText(body.transfer_unit) ?? consumptionUnit,
      transfer_quantity: toNumber(body.transfer_quantity, 1) ?? 1,
    },
    itemKind,
    menuGroupId,
    storagePayload,
    resolvedStorageHomeIds,
    defaultWarehouseId,
  };
}

export async function firestoreCatalogItemsGet(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() || null;
  const search = url.searchParams.get("q")?.trim().toLowerCase() || "";

  if (id) {
    const item = await getFirestoreCatalogItem(id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [enriched] = await enrichFirestoreItems([item]);
    return NextResponse.json({ item: enriched, backend: "firebase" });
  }

  const items = await listFirestoreCatalogItems(search);
  return NextResponse.json({ items, backend: "firebase" });
}

export async function firestoreCatalogItemsPost(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const built = buildItemPayload(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  let resolvedSku = built.payload.sku;
  if (built.itemKind === "finished") {
    resolvedSku = await allocateFirestorePosItemSku(resolvedSku);
  }

  const data = await createFirestoreCatalogItem({ ...built.payload, sku: resolvedSku });
  if (built.storagePayload) {
    await syncFirestoreBaseStorageHomes(String(data.id), built.resolvedStorageHomeIds);
  }

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "insert",
    entityType: "item",
    entityId: String(data.id),
    entityName: built.payload.name,
    sku: resolvedSku,
    menuGroupId: built.menuGroupId,
    actor,
    after: {
      name: built.payload.name,
      selling_price: built.payload.selling_price,
      cost: built.payload.cost,
      sku: resolvedSku,
      menu_group_id: built.menuGroupId,
      active: built.payload.active,
      item_kind: built.itemKind,
    },
    trackedFields: [...ITEM_TRACKED_FIELDS],
  });

  const [enriched] = await enrichFirestoreItems([{ ...data, sku: resolvedSku }]);
  scheduleOutletOrderCatalogRefresh(String(data.id));
  return NextResponse.json({ item: enriched, backend: "firebase" });
}

export async function firestoreCatalogItemsPut(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = cleanText(body.id);
  if (!id || !isUuid(id)) return NextResponse.json({ error: "id is required for update" }, { status: 400 });

  const imageOnly =
    body.image_url !== undefined &&
    body.name === undefined &&
    body.item_kind === undefined &&
    body.selling_price === undefined &&
    body.cost === undefined;

  if (imageOnly) {
    const existingRow = await getFirestoreCatalogItem(id);
    if (!existingRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const data = await updateFirestoreCatalogItem(id, {
      image_url: cleanText(body.image_url) ?? null,
    });
    if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChange({
      operation: "update",
      entityType: "item",
      entityId: id,
      entityName: String(existingRow.name ?? ""),
      sku: (existingRow.sku as string | null) ?? null,
      menuGroupId: (existingRow.menu_group_id as string | null) ?? null,
      before: existingRow,
      after: { ...existingRow, image_url: cleanText(body.image_url) ?? null },
      trackedFields: ["image_url"],
      actor,
    });

    const [enriched] = await enrichFirestoreItems([data]);
    scheduleOutletOrderCatalogRefresh(id);
    return NextResponse.json({ item: enriched, backend: "firebase" });
  }

  const built = buildItemPayload(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const existingRow = await getFirestoreCatalogItem(id);
  if (!existingRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const data = await updateFirestoreCatalogItem(id, {
    ...built.payload,
    sku: cleanText(body.sku) ?? built.payload.sku,
  });
  if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (built.storagePayload) {
    await syncFirestoreBaseStorageHomes(id, built.resolvedStorageHomeIds);
  }

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "update",
    entityType: "item",
    entityId: id,
    entityName: built.payload.name,
    sku: cleanText(body.sku) ?? (data.sku as string | null) ?? null,
    menuGroupId: built.menuGroupId,
    before: existingRow,
    after: {
      name: built.payload.name,
      selling_price: built.payload.selling_price,
      cost: built.payload.cost,
      sku: cleanText(body.sku) ?? null,
      menu_group_id: built.menuGroupId,
      active: built.payload.active,
      item_kind: built.itemKind,
    },
    trackedFields: [...ITEM_TRACKED_FIELDS],
    actor,
  });

  const [enriched] = await enrichFirestoreItems([data]);
  scheduleOutletOrderCatalogRefresh(id);
  return NextResponse.json({ item: enriched, backend: "firebase" });
}

export async function firestoreCatalogItemsDelete(request: Request) {
  const url = new URL(request.url);
  let id = url.searchParams.get("id")?.trim() || "";
  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = typeof body.id === "string" ? body.id.trim() : "";
  }
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Valid id is required for delete" }, { status: 400 });

  const existingRow = await getFirestoreCatalogItem(id);
  if (!existingRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const deleted = await deleteFirestoreCatalogItem(id);
  if (!deleted) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "delete",
    entityType: "item",
    entityId: id,
    entityName: existingRow.name as string,
    sku: (existingRow.sku as string | null) ?? null,
    menuGroupId: (existingRow.menu_group_id as string | null) ?? null,
    before: existingRow,
    trackedFields: [...ITEM_TRACKED_FIELDS],
    actor,
  });

  scheduleOutletOrderCatalogRefresh(id);
  return NextResponse.json({ id, backend: "firebase" });
}
