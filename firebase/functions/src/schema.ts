/**
 * Firestore collection paths and document shapes for Afterten migration.
 * SCPGT + portal + Cloud Functions share these conventions.
 */

export const COLLECTIONS = {
  outlets: "outlets",
  outletHeartbeats: "outlet_heartbeats",
  posSyncFailures: "pos_sync_failures",
  outletCounters: "outlet_counters",
  catalogItems: "catalog_items",
  catalogVariants: "catalog_variants",
  catalogMenuGroups: "catalog_menu_groups",
  outletCatalogSyncEvents: "outlet_catalog_sync_events",
  outletCatalogBindings: "outlet_catalog_bindings",
  outletCashiers: "outlet_cashiers",
  outletCashierSyncEvents: "outlet_cashier_sync_events",
  transferOrders: "transfer_orders",
  transferOrderCounters: "transfer_order_counters",
  outletOrderCatalog: "outlet_order_catalog",
  outletOrderRoutes: "outlet_order_routes",
  appUsers: "app_users",
} as const;

/** pos_sales/{outletId}/bills/{sourceEventId} */
export function posSalesBillPath(outletId: string, sourceEventId: string): string {
  return `pos_sales/${outletId}/bills/${sourceEventId}`;
}

export function posSalesBillsCollection(outletId: string): string {
  return `pos_sales/${outletId}/bills`;
}

export interface OutletDoc {
  name: string;
  hasPosMiddleware: boolean;
  usesOrdersApp: boolean;
  warehouseIds: string[];
  active: boolean;
  updatedAt: string;
}

export interface OutletHeartbeatDoc {
  outletId: string;
  lastSeenAt: string;
  pendingSalesCount: number;
  lastSyncError: string | null;
  lastSaleUploadedAt: string | null;
  middlewareVersion: string | null;
  updatedAt: string;
}

export interface PosSalesBillDoc {
  outletId: string;
  sourceEventId: string;
  occurredAt: string;
  status: string;
  rawPayload: Record<string, unknown>;
  shiftId: number | null;
  terminalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PosSyncFailureDoc {
  outletId: string;
  sourceEventId: string;
  stage: string;
  errorMessage: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface OutletCatalogSyncEventDoc {
  outletId: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  createdAt: string;
  deliveredAt: string | null;
}

export interface CatalogItemDoc {
  id: string;
  name: string;
  itemSku: string;
  menuGroupId: string | null;
  active: boolean;
  updatedAt: string;
}

export interface CatalogVariantDoc {
  id: string;
  itemId: string;
  variantSku: string;
  name: string;
  sellingPrice: number | null;
  active: boolean;
  updatedAt: string;
}

export interface OutletCatalogBindingDoc {
  outletId: string;
  itemSku: string;
  variantSku: string;
  catalogItemId: string;
  catalogVariantId: string | null;
  posItemName: string | null;
  updatedAt: string;
}

export interface OutletCounterDoc {
  outletId: string;
  posSyncOpeningLastValue: number | null;
  posSyncCutoffLastValue: number | null;
  updatedAt: string;
}

export interface OutletCashierDoc {
  outletId: string;
  name: string;
  username: string;
  userType: string;
  posUserId: number | null;
  syncStatus: "pending_insert" | "synced" | "pending_delete" | "deleted";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
}

export interface OutletCashierSyncEventDoc {
  outletId: string;
  cashierId: string | null;
  action: "insert" | "delete" | "pull";
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  createdAt: string;
  deliveredAt: string | null;
  errorMessage: string | null;
}

export interface TransferOrderDoc {
  outletId: string;
  outletName: string;
  orderNumber: string;
  status: "order_placed" | "placed" | "accepted" | "loaded" | "completed";
  locked: boolean;
  employeeName: string | null;
  supervisorName: string | null;
  driverName: string | null;
  createdAt: string;
  updatedAt: string;
  modifiedBySupervisor: boolean;
  supervisorEditedName?: string | null;
  supervisorEditedAt?: string | null;
}

export interface TransferOrderItemDoc {
  productId: string | null;
  variantKey: string | null;
  name: string;
  receivingUom: string;
  consumptionUom: string;
  cost: number;
  qty: number;
  qtyCases: number | null;
  packageContains: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface AppUserDoc {
  email: string;
  displayName?: string;
  outletId: string;
  outletName: string;
  roles: Array<"branch" | "supervisor" | "warehouse_admin" | "transfers">;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OutletOrderCatalogDoc {
  outletId: string;
  name: string;
  sku: string | null;
  cost: number;
  purchasePackUnit: string;
  consumptionUom: string;
  unitsPerPurchasePack: number;
  hasVariations: boolean;
  active: boolean;
  updatedAt: string;
}
