import "server-only";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-server";
import type { MiddlewareOutletAuth } from "@/lib/middleware-api-auth";

const ALLOWED_RPCS = new Set([
  "validate_pos_order",
  "sync_pos_order",
  "patch_pos_order_payload",
  "log_pos_sync_failure",
  "clear_pos_sync_failure",
  "upsert_outlet_heartbeat",
  "fetch_outlet_catalog_sync",
  "mark_catalog_sync_delivered",
  "fetch_outlet_cashier_sync",
  "mark_cashier_sync_delivered",
  "mark_cashier_sync_failed",
  "complete_cashier_insert_sync",
  "complete_cashier_delete_sync",
  "upsert_outlet_cashiers_from_pos",
  "sync_pos_catalog_from_middleware",
  "sync_outlet_pos_catalog_bindings",
  "sync_pos_menu_groups_from_middleware",
  "list_orders_missing_shift",
  "debug_pos_sync_counter",
]);

const ALLOWED_GET_TABLES = new Set([
  "outlet_sales",
  "orders",
  "outlet_warehouses",
  "warehouses",
  "outlets",
  "outlet_pos_heartbeats",
  "counter_values",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readOutletIdFromPayload(body: Record<string, unknown>): string | null {
  const payload = asObject(body.payload);
  const direct =
    body.outlet_id ??
    body.p_outlet_id ??
    payload?.outlet_id ??
    payload?.p_outlet_id;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

function assertOutletScopedValue(actual: string | null, outletId: string, label: string) {
  if (!actual) return;
  if (actual.toLowerCase() !== outletId.toLowerCase()) {
    throw new MiddlewareProxyError(`Cross-outlet access denied for ${label}`, 403);
  }
}

function extractEqValue(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("eq.")) return null;
  return trimmed.slice(3).trim() || null;
}

function assertGetPathAllowed(pathParts: string[], outletId: string, searchParams: URLSearchParams) {
  if (pathParts.length < 3 || pathParts[0] !== "rest" || pathParts[1] !== "v1") {
    throw new MiddlewareProxyError("Unsupported middleware GET path", 403);
  }

  const table = pathParts[2];
  if (!ALLOWED_GET_TABLES.has(table)) {
    throw new MiddlewareProxyError(`GET not allowed for table ${table}`, 403);
  }

  if (table === "outlets") {
    assertOutletScopedValue(extractEqValue(searchParams.get("id")), outletId, "outlets.id");
    return;
  }

  if (table === "warehouses") {
    return;
  }

  assertOutletScopedValue(extractEqValue(searchParams.get("outlet_id")), outletId, "outlet_id");
  assertOutletScopedValue(extractEqValue(searchParams.get("scope_id")), outletId, "scope_id");
}

export class MiddlewareProxyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MiddlewareProxyError";
    this.status = status;
  }
}

async function forwardGetToSupabase(pathParts: string[], searchParams: URLSearchParams): Promise<Response> {
  const restPath = pathParts.join("/");
  const query = searchParams.toString();
  const url = `${getSupabaseUrl().replace(/\/$/, "")}/${restPath}${query ? `?${query}` : ""}`;
  const serviceKey = getSupabaseServiceRoleKey();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function forwardMiddlewareSupabaseRequest(options: {
  method: string;
  pathParts: string[];
  searchParams: URLSearchParams;
  bodyText: string | null;
  auth: MiddlewareOutletAuth;
}): Promise<Response> {
  const { method, pathParts, searchParams, bodyText, auth } = options;
  const upperMethod = method.toUpperCase();

  if (upperMethod === "GET") {
    assertGetPathAllowed(pathParts, auth.outletId, searchParams);
    return forwardGetToSupabase(pathParts, searchParams);
  }

  if (upperMethod !== "POST" || pathParts[0] !== "rest" || pathParts[1] !== "v1" || pathParts[2] !== "rpc") {
    throw new MiddlewareProxyError(`HTTP method not allowed: ${upperMethod}`, 405);
  }

  const rpcName = pathParts[3];
  if (!rpcName || !ALLOWED_RPCS.has(rpcName)) {
    throw new MiddlewareProxyError(`RPC not allowed: ${rpcName ?? "(missing)"}`, 403);
  }

  let rpcBody: Record<string, unknown> = {};
  if (bodyText?.trim()) {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MiddlewareProxyError("RPC body must be a JSON object", 400);
    }
    rpcBody = parsed as Record<string, unknown>;
  }

  const payloadOutletId = readOutletIdFromPayload(rpcBody);
  assertOutletScopedValue(payloadOutletId, auth.outletId, "RPC outlet_id");

  if (rpcBody.p_outlet_id === undefined && rpcBody.outlet_id === undefined) {
    const payload = asObject(rpcBody.payload);
    if (payload && payload.outlet_id === undefined) {
      payload.outlet_id = auth.outletId;
      rpcBody.payload = payload;
    }
  }

  const url = `${getSupabaseUrl().replace(/\/$/, "")}/rest/v1/rpc/${rpcName}`;
  const serviceKey = getSupabaseServiceRoleKey();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rpcBody),
    cache: "no-store",
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
