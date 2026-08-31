import "server-only";

import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export type MiddlewareOutletAuth = {
  outletId: string;
  outletName: string;
};

function cleanBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function tokensMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function authenticateMiddlewareRequest(request: Request): Promise<MiddlewareOutletAuth> {
  const token = cleanBearerToken(request);
  if (!token) {
    throw new MiddlewareAuthError("Missing Authorization: Bearer token", 401);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("outlets")
    .select("id,name,middleware_api_token,active,has_pos_middleware")
    .not("middleware_api_token", "is", null);

  if (error) {
    throw new MiddlewareAuthError(`Outlet lookup failed: ${error.message}`, 500);
  }

  const outlet = (data ?? []).find(
    (row) =>
      typeof row.middleware_api_token === "string" &&
      tokensMatch(token, row.middleware_api_token.trim()),
  );

  if (!outlet) {
    throw new MiddlewareAuthError("Invalid middleware token", 401);
  }

  if (outlet.active === false) {
    throw new MiddlewareAuthError("Outlet is inactive", 403);
  }

  if (outlet.has_pos_middleware === false) {
    throw new MiddlewareAuthError("Outlet is not enabled for POS middleware", 403);
  }

  return {
    outletId: String(outlet.id),
    outletName: String(outlet.name ?? "Outlet"),
  };
}

export class MiddlewareAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MiddlewareAuthError";
    this.status = status;
  }
}
