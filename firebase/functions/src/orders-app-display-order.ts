/** Base product IDs shown first on the Orders app create-order grid (in this order). */
export const ORDERS_APP_PINNED_PRODUCT_ORDER = [
  "bbafd6a5-aa46-44ea-ac60-14da9bd4eaa2",
  "a029c3dc-4b03-4290-a579-c804367389a7",
  "bc75117f-737d-48be-9450-556a46cda167",
  "405807f9-03c9-401d-acb8-26980b492491",
  "d550d20b-78f8-434f-a079-b7613cc00512",
  "4b340326-5f47-492f-924b-4771e434ea60",
  "4313479e-0f97-4197-a638-bee916bf4a07",
  "cd145afb-0994-4c67-bf42-a9db9c3cc3ef",
  "ca6c3236-05e9-42ad-a771-1c03a25dd5f1",
  "9e566a0c-92f4-4934-99ea-57f3da77e141",
  "fa313d72-146b-49d3-8e84-32995bad6335",
  "84a62432-988c-4727-b4e0-40e5862e2a34",
  "25ec621e-aab0-47b3-9ec2-7c2fd8e28996",
  "01527adf-f9d2-43c5-878b-21aac3430e48",
  "b0404d75-8f9f-442d-9f46-bae16a08c01f",
  "2eebecc2-e42c-4c06-b2d2-46bd4736df0e",
  "8239c94f-a2d4-4ef5-9e3d-07b9e6bc6334",
  "e766c23c-a424-4bfa-9192-686e16fb7a4f",
  "8bbcc191-b5f3-4b1e-b4cc-fb4ef8e61c52",
  "682aaa57-3762-4129-bd38-f7e9e2281f8c",
  "669082a2-e0e2-4495-94cb-63841bd5fe40",
  "2075f991-172b-4987-a3e7-dac5f79a2eea",
  "f258c720-a820-4754-91bb-8dda2bf161d0",
  "8ad0193e-17d9-4654-ab39-c25554f380e0",
  "94265358-7c6d-4092-a70d-a78f64c73170",
  "f7ad29fa-bf17-4864-957b-be1c029aee80",
  "31dfde25-ecf9-4965-9e15-a79f81fa898c",
  "65e592fd-8489-456a-87b0-e76ba3c057c2",
  "55884ca9-699a-46eb-bb15-239d17d5addf",
  "d3244668-cc95-4e09-911a-38ebfeebd6f2",
  "b16dbe2c-d0dc-4379-ab15-59de21a63634",
  "a2b92c70-0aec-4d38-9949-599ce491a855",
  "0ea40346-37bc-46a5-b461-be681433453d",
  "c49ca7f8-cf67-463a-997c-2c6226d69abe",
  "a8061bbf-58c9-4729-b9a3-35b70ed40469",
  "3f7e0f3f-1dac-4cc1-9bac-7bad501a86ae",
  "f1dcdafe-e0cc-4fc9-a90a-5e929ee1507a",
  "42371178-5520-4916-ad73-fc556e5e3c6d",
  "1e037d27-85cc-4e45-8421-4da7dc6c1a3a",
  "ff78671b-1673-42c5-a0cb-2ae70982e684",
  "35f0a274-d73a-46e5-b9dd-739b3644241f",
  "fd67bddb-d5cf-4c66-8821-906ea4ee1d1f",
  "5f6ed112-297f-4c5a-9aee-0d2b81135634",
] as const;

const PINNED_RANK_BY_PRODUCT_ID = new Map<string, number>(
  ORDERS_APP_PINNED_PRODUCT_ORDER.map((productId, index) => [productId, index]),
);

const PINNED_COUNT = ORDERS_APP_PINNED_PRODUCT_ORDER.length;
const CUSTOM_ORDER_OFFSET = PINNED_COUNT;

function readOptionalDisplayOrder(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export function readOrdersAppDisplayOrderFromRow(row?: Record<string, unknown> | null): number | null {
  if (!row) return null;
  return readOptionalDisplayOrder(
    row.orders_app_display_order ?? row.ordersAppDisplayOrder,
  );
}

/** Lower rank sorts earlier. Pinned IDs win, then catalog field, then alphabetical fallback. */
export function resolveOrdersAppDisplayRank(
  productId: string,
  displayOrderFromCatalog?: number | null,
): number {
  const normalizedProductId = String(productId ?? "").trim();
  const pinnedRank = PINNED_RANK_BY_PRODUCT_ID.get(normalizedProductId);
  if (pinnedRank != null) return pinnedRank;

  if (displayOrderFromCatalog != null) {
    return CUSTOM_ORDER_OFFSET + displayOrderFromCatalog;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function compareOrdersAppCatalogProducts(
  left: {
    productId: string;
    name: string;
    ordersAppDisplayOrder?: number | null;
  },
  right: {
    productId: string;
    name: string;
    ordersAppDisplayOrder?: number | null;
  },
): number {
  const leftRank = resolveOrdersAppDisplayRank(left.productId, left.ordersAppDisplayOrder ?? null);
  const rightRank = resolveOrdersAppDisplayRank(right.productId, right.ordersAppDisplayOrder ?? null);
  if (leftRank !== rightRank) return leftRank - rightRank;

  return String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, {
    sensitivity: "base",
  });
}
