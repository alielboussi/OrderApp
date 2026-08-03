export const WAREHOUSE_AUDIT_VIEWER_USER_IDS = [
  "282b9e25-f146-42d1-856f-8fee071fe2e7",
] as const;

export const WAREHOUSE_AUDIT_VIEWER_EMAILS = [
  "alielboussi00@gmail.com",
  "husseinelboussizam@gmail.com",
  "mohammadalboussi@gmail.com",
] as const;

export function canViewWarehouseAuditLogs(
  userId: string | null | undefined,
  email?: string | null,
): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  if (
    normalizedEmail &&
    WAREHOUSE_AUDIT_VIEWER_EMAILS.includes(
      normalizedEmail as (typeof WAREHOUSE_AUDIT_VIEWER_EMAILS)[number],
    )
  ) {
    return true;
  }
  if (!userId) return false;
  return WAREHOUSE_AUDIT_VIEWER_USER_IDS.includes(
    userId as (typeof WAREHOUSE_AUDIT_VIEWER_USER_IDS)[number],
  );
}

export const WAREHOUSE_AUDIT_ACTIONS = {
  ADD_PRODUCT: "Add Product",
  ADD_PRODUCT_INFORMATION: "Add Product Information",
  ADD_VARIANT: "Add Variant",
  EDIT_PRODUCT_INFORMATION: "Edit Product Information",
  EDIT_VARIANT: "Edit Variant",
  DELETE_PRODUCT: "Delete Product",
  DELETE_VARIANT: "Delete Variant",
  SEND_TO_MIDDLEWARE: "Send To Middleware",
  OUTLETS_SENT_TO: "Which Outlets Sent To",
} as const;

export type WarehouseAuditAction =
  (typeof WAREHOUSE_AUDIT_ACTIONS)[keyof typeof WAREHOUSE_AUDIT_ACTIONS];

export const WAREHOUSE_AUDIT_ACTION_OPTIONS: WarehouseAuditAction[] = [
  WAREHOUSE_AUDIT_ACTIONS.ADD_PRODUCT,
  WAREHOUSE_AUDIT_ACTIONS.ADD_PRODUCT_INFORMATION,
  WAREHOUSE_AUDIT_ACTIONS.ADD_VARIANT,
  WAREHOUSE_AUDIT_ACTIONS.EDIT_PRODUCT_INFORMATION,
  WAREHOUSE_AUDIT_ACTIONS.EDIT_VARIANT,
  WAREHOUSE_AUDIT_ACTIONS.DELETE_PRODUCT,
  WAREHOUSE_AUDIT_ACTIONS.DELETE_VARIANT,
  WAREHOUSE_AUDIT_ACTIONS.SEND_TO_MIDDLEWARE,
  WAREHOUSE_AUDIT_ACTIONS.OUTLETS_SENT_TO,
];

export type WarehouseAuditDetails = Record<string, unknown>;

export type WarehouseAuditPayload = {
  action: WarehouseAuditAction | string;
  page?: string | null;
  method?: string | null;
  status?: number | null;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: WarehouseAuditDetails | null;
};

export function formatAuditDetails(details: WarehouseAuditDetails | null | undefined): string {
  if (!details || typeof details !== "object") return "-";
  const outlets = details.outlets_sent_to;
  if (Array.isArray(outlets) && outlets.length > 0) {
    const names = outlets
      .map((entry) => {
        if (entry && typeof entry === "object" && "name" in entry) {
          return String((entry as { name?: string }).name ?? "");
        }
        return typeof entry === "string" ? entry : "";
      })
      .filter(Boolean);
    if (names.length) return `Outlets: ${names.join(", ")}`;
  }
  try {
    return JSON.stringify(details);
  } catch {
    return "-";
  }
}
