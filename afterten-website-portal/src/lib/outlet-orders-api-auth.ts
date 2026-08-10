import "server-only";

import { NextResponse } from "next/server";

export function readOutletOrdersApiBearerKey(): string {
  return process.env.OUTLET_ORDERS_API_BEARER_KEY?.trim() ?? "";
}

export function requireOutletOrdersApiBearer(
  request: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  const configuredKey = readOutletOrdersApiBearerKey();
  if (!configuredKey) {
    console.error("[outlet-orders-api] OUTLET_ORDERS_API_BEARER_KEY is not configured");
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Outlet orders API is not configured on the server." },
        { status: 500 },
      ),
    };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== configuredKey) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { ok: true };
}
