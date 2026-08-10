import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";
import { computeOrderTotalOrdered } from "@/lib/order-total-ordered";
import { expandPortalOrderItemsWithCompanions, getCompanionProductIdsForSourceProduct, isCompanionProduct } from "@/lib/order-qty-rules";
import { formatOrdersAppUom } from "@/lib/orders-app-uom";
import {
  getSupervisorDisplayQtyForOrderItem,
  productBaseName,
  resolveBaseProductNameFromCatalog,
  resolveCatalogRowForOrderItem,
  resolveVariantDisplayLabel,
  type PortalCatalogProduct,
  type PortalOrderItem,
} from "@/lib/portal-transfer-order-edit";
import {
  listFirestoreDamageReportLines,
  listFirestoreDamageReports,
  type DamageReportLineRow,
  type DamageReportRow,
} from "@/lib/firestore-damage-reports";
import {
  listFirestoreOutletOrderCatalog,
  listFirestoreTransferOrderItems,
  type FirestoreOutletCatalogProduct,
  type FirestoreTransferOrderItem,
} from "@/lib/firestore-transfer-orders";
import { listFirestoreUomOptions } from "@/lib/firestore-uoms";
import { isTransferOrderOnDate, resolveTransferOrderCreatedAt } from "@/lib/transfer-order-dates";

export const ACCEPTED_OUTLET_ORDERS_API_FORMAT_VERSION = 1;

const ACCEPTED_ORDER_STATUSES = new Set(["accepted", "loaded", "completed"]);
const APPROVED_DAMAGE_STATUSES = new Set(["accepted", "loaded", "completed"]);

export type AcceptedOutletOrderApiLine = {
  id: string;
  product_id: string | null;
  variant_key: string | null;
  name: string;
  display_label: string;
  is_variant: boolean;
  is_companion: boolean;
  orders_app_uom: string;
  orders_app_uom_label: string;
  supervisor_uom: string;
  supervisor_uom_label: string;
  consumption_uom: string | null;
  supervisor_uom_qty_per_unit: number;
  outlet_qty: number;
  supervisor_qty: number;
  uom_weight_enabled: boolean;
  uom_weight_grams: number | null;
  total_ordered: number;
  total_ordered_unit: string;
  cost: number;
  amount: number;
};

export type AcceptedOutletOrderApiProductGroup = {
  product_id: string;
  product_name: string;
  lines: AcceptedOutletOrderApiLine[];
};

type ReviewPortalLine = {
  item: PortalOrderItem;
  productName: string;
  displayLabel: string;
  showAsVariant: boolean;
  isCompanion: boolean;
};

function buildReviewPortalLine(
  item: PortalOrderItem,
  catalog: PortalCatalogProduct[],
  productName: string,
  isCompanion: boolean,
): ReviewPortalLine {
  const catalogRow = resolveCatalogRowForOrderItem(item, catalog);
  const showAsVariant = Boolean(item.variant_key?.trim()) || Boolean(catalogRow?.variant_id);
  const displayLabel = showAsVariant
    ? resolveVariantDisplayLabel(productName, String(item.name ?? ""))
    : String(item.name ?? "").trim();

  return {
    item,
    productName,
    displayLabel,
    showAsVariant,
    isCompanion,
  };
}

function groupPortalItemsForAcceptedApi(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
): Array<{ productId: string; productName: string; lines: ReviewPortalLine[] }> {
  const companionItemsByProductId = new Map<string, PortalOrderItem>();
  const mainItems: PortalOrderItem[] = [];

  for (const item of items) {
    const productId = String(item.product_id ?? "").trim();
    if (!productId) continue;
    if (isCompanionProduct(productId)) {
      companionItemsByProductId.set(productId, item);
    } else {
      mainItems.push(item);
    }
  }

  const groups = new Map<string, { productId: string; productName: string; lines: ReviewPortalLine[] }>();
  const claimedCompanionIds = new Set<string>();

  for (const item of mainItems) {
    const productId = String(item.product_id ?? "").trim();
    const productName =
      resolveBaseProductNameFromCatalog(item.product_id, catalog, item) ||
      productBaseName(item.name) ||
      String(item.name ?? "").trim() ||
      "Product";

    const group =
      groups.get(productId) ??
      ({
        productId,
        productName,
        lines: [],
      } satisfies { productId: string; productName: string; lines: ReviewPortalLine[] });

    if (productName) group.productName = productName;
    group.lines.push(buildReviewPortalLine(item, catalog, group.productName, false));

    for (const companionProductId of getCompanionProductIdsForSourceProduct(productId)) {
      const companionItem = companionItemsByProductId.get(companionProductId);
      if (!companionItem) continue;
      claimedCompanionIds.add(companionProductId);
      group.lines.push(buildReviewPortalLine(companionItem, catalog, group.productName, true));
    }

    groups.set(productId, group);
  }

  for (const [companionProductId, companionItem] of companionItemsByProductId) {
    if (claimedCompanionIds.has(companionProductId)) continue;
    const productName =
      resolveBaseProductNameFromCatalog(companionItem.product_id, catalog, companionItem) ||
      productBaseName(companionItem.name) ||
      String(companionItem.name ?? "").trim() ||
      "Product";
    groups.set(companionProductId, {
      productId: companionProductId,
      productName,
      lines: [buildReviewPortalLine(companionItem, catalog, productName, false)],
    });
  }

  return [...groups.values()].sort((left, right) =>
    left.productName.localeCompare(right.productName, undefined, { sensitivity: "base" }),
  );
}

export type AcceptedOutletOrderApiOrder = {
  id: string;
  order_number: string | null;
  outlet_id: string;
  outlet_name: string | null;
  status: string | null;
  created_at: string | null;
  accepted_at: string | null;
  supervisor_name: string | null;
  modified_by_supervisor: boolean;
  product_groups: AcceptedOutletOrderApiProductGroup[];
  items: AcceptedOutletOrderApiLine[];
  totals: {
    outlet_qty: number;
    amount: number;
  };
};

export type AcceptedOutletOrderApiDamage = DamageReportRow & {
  accepted_at: string | null;
  supervisor_name: string | null;
  lines: DamageReportLineRow[];
};

export type AcceptedOutletOrdersExport = {
  api_format_version: number;
  date: string | null;
  outlet_id: string | null;
  orders: AcceptedOutletOrderApiOrder[];
  damages: AcceptedOutletOrderApiDamage[];
  cloud_backend: "firebase";
};

function toPortalCatalogProduct(row: FirestoreOutletCatalogProduct): PortalCatalogProduct {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    variant_id: row.variant_id,
    variant_key: row.variant_key,
    name: row.name,
    selling_price: row.selling_price,
    orders_app_uom: row.orders_app_uom,
    supervisor_uom: row.supervisor_uom,
    consumption_uom: row.consumption_uom,
    units_per_purchase_pack: row.units_per_purchase_pack,
    supervisor_uom_qty_per_unit: row.supervisor_uom_qty_per_unit,
    uom_weight_enabled: row.uom_weight_enabled,
    uom_weight_grams: row.uom_weight_grams,
  };
}

function toPortalOrderItem(orderId: string, row: FirestoreTransferOrderItem): PortalOrderItem {
  return {
    id: row.id,
    order_id: row.order_id ?? orderId,
    product_id: row.product_id,
    variant_key: row.variant_key,
    name: row.name,
    receiving_uom: row.receiving_uom,
    consumption_uom: row.consumption_uom,
    qty: row.qty,
    cost: row.cost,
    amount: row.amount,
    package_contains: row.package_contains,
  };
}

function serializeAcceptedOrderLine(
  line: ReviewPortalLine,
  catalog: PortalCatalogProduct[],
  uomOptions: Awaited<ReturnType<typeof listFirestoreUomOptions>>,
): AcceptedOutletOrderApiLine {
  const item = line.item;
  const productId = String(item.product_id ?? "").trim() || null;
  const outletQty = Number(item.qty ?? 0);
  const catalogRow = resolveCatalogRowForOrderItem(item, catalog);
  const perUnit = catalogRow?.supervisor_uom_qty_per_unit ?? item.package_contains ?? 1;
  const ordersAppUom = catalogRow?.orders_app_uom ?? String(item.receiving_uom ?? "pc");
  const supervisorUom = catalogRow?.supervisor_uom ?? ordersAppUom;
  const total = computeOrderTotalOrdered({
    outlet_qty: outletQty,
    supervisor_uom_qty_per_unit: perUnit,
    uom_weight_enabled: catalogRow?.uom_weight_enabled ?? false,
    uom_weight_grams: catalogRow?.uom_weight_grams ?? null,
    orders_app_uom: ordersAppUom,
    supervisor_uom: supervisorUom,
  });
  const supervisorQty = getSupervisorDisplayQtyForOrderItem(item, catalog);
  const cost = Number(item.cost ?? 0);
  const amount = Number(item.amount ?? cost * outletQty);

  return {
    id: item.id,
    product_id: productId,
    variant_key: item.variant_key ?? null,
    name: String(item.name ?? ""),
    display_label: line.displayLabel,
    is_variant: line.showAsVariant,
    is_companion: line.isCompanion,
    orders_app_uom: ordersAppUom,
    orders_app_uom_label: formatOrdersAppUom(ordersAppUom, outletQty, uomOptions),
    supervisor_uom: supervisorUom,
    supervisor_uom_label: formatOrdersAppUom(supervisorUom, supervisorQty, uomOptions),
    consumption_uom: item.consumption_uom ?? null,
    supervisor_uom_qty_per_unit: perUnit,
    outlet_qty: outletQty,
    supervisor_qty: supervisorQty,
    uom_weight_enabled: total.uom_weight_enabled,
    uom_weight_grams: total.uom_weight_grams,
    total_ordered: total.total_ordered,
    total_ordered_unit: total.total_ordered_unit,
    cost,
    amount,
  };
}

async function buildAcceptedOrderPayload(
  orderId: string,
  data: FirebaseFirestore.DocumentData,
  catalogByOutlet: Map<string, PortalCatalogProduct[]>,
  uomOptions: Awaited<ReturnType<typeof listFirestoreUomOptions>>,
): Promise<AcceptedOutletOrderApiOrder> {
  const outletId = String(data.outletId ?? data.outlet_id ?? "").trim();
  if (!catalogByOutlet.has(outletId)) {
    const catalogRows = await listFirestoreOutletOrderCatalog(outletId);
    catalogByOutlet.set(outletId, catalogRows.map(toPortalCatalogProduct));
  }
  const catalog = catalogByOutlet.get(outletId) ?? [];

  const rawItems = await listFirestoreTransferOrderItems(orderId);
  const portalItems = rawItems.map((row) => toPortalOrderItem(orderId, row));
  const expandedItems = expandPortalOrderItemsWithCompanions(portalItems, catalog, orderId);
  const productGroups = groupPortalItemsForAcceptedApi(expandedItems, catalog);

  const serializedGroups = productGroups.map((group) => ({
    product_id: group.productId,
    product_name: group.productName,
    lines: group.lines.map((line) => serializeAcceptedOrderLine(line, catalog, uomOptions)),
  }));

  const flatItems = serializedGroups.flatMap((group) => group.lines);
  const totals = flatItems.reduce(
    (acc, line) => {
      acc.outlet_qty += line.outlet_qty;
      acc.amount += line.amount;
      return acc;
    },
    { outlet_qty: 0, amount: 0 },
  );

  return {
    id: orderId,
    order_number: (data.orderNumber as string | null | undefined) ?? (data.order_number as string | null | undefined) ?? null,
    outlet_id: outletId,
    outlet_name: (data.outletName as string | null | undefined) ?? (data.outlet_name as string | null | undefined) ?? null,
    status: (data.status as string | null | undefined) ?? null,
    created_at: resolveTransferOrderCreatedAt(data),
    accepted_at:
      (data.acceptedAt as string | null | undefined) ??
      (data.accepted_at as string | null | undefined) ??
      (data.supervisorEditedAt as string | null | undefined) ??
      null,
    supervisor_name:
      (data.supervisorName as string | null | undefined) ??
      (data.supervisor_name as string | null | undefined) ??
      null,
    modified_by_supervisor: Boolean(data.modifiedBySupervisor ?? data.modified_by_supervisor),
    product_groups: serializedGroups,
    items: flatItems,
    totals,
  };
}

async function buildApprovedDamagesPayload(
  date: string | null,
  outletId: string | null,
): Promise<AcceptedOutletOrderApiDamage[]> {
  const { reports } = await listFirestoreDamageReports({ date, outletId });
  const approved = reports.filter((report) => APPROVED_DAMAGE_STATUSES.has(String(report.status ?? "").trim().toLowerCase()));

  return Promise.all(
    approved.map(async (report) => {
      const lines = await listFirestoreDamageReportLines(report.id);
      return {
        ...report,
        accepted_at: report.supervisor_reviewed_at,
        supervisor_name: report.supervisor_reviewed_name,
        lines,
      };
    }),
  );
}

export async function buildAcceptedOutletOrdersExport(options: {
  date?: string | null;
  outletId?: string | null;
}): Promise<AcceptedOutletOrdersExport> {
  const db = getFirestoreDb();
  const uomOptions = await listFirestoreUomOptions();
  const ordersSnap = await db.collection("transfer_orders").get();
  const catalogByOutlet = new Map<string, PortalCatalogProduct[]>();

  const orders = (
    await Promise.all(
      ordersSnap.docs.map(async (doc) => {
        const data = doc.data();
        const sourceEventId = data.source_event_id ?? data.sourceEventId;
        if (sourceEventId != null && sourceEventId !== "") return null;

        const status = String(data.status ?? "").trim().toLowerCase();
        if (!ACCEPTED_ORDER_STATUSES.has(status)) return null;

        const createdAt = resolveTransferOrderCreatedAt(data);
        if (options.date && !isTransferOrderOnDate(createdAt, options.date)) return null;

        const rowOutletId = String(data.outletId ?? data.outlet_id ?? "").trim();
        if (options.outletId && options.outletId !== "all" && rowOutletId !== options.outletId) return null;

        return buildAcceptedOrderPayload(doc.id, data, catalogByOutlet, uomOptions);
      }),
    )
  ).filter((row): row is AcceptedOutletOrderApiOrder => row != null);

  orders.sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });

  const damages = await buildApprovedDamagesPayload(options.date ?? null, options.outletId ?? null);

  return {
    api_format_version: ACCEPTED_OUTLET_ORDERS_API_FORMAT_VERSION,
    date: options.date ?? null,
    outlet_id: options.outletId ?? null,
    orders,
    damages,
    cloud_backend: "firebase",
  };
}
