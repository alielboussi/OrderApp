import { NextRequest } from "next/server";
import { handleOutletMiddlewareSalesRequest } from "@/lib/outlet-middleware-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Till 1 & Till 2 — one shared middleware sales export (Quick Corner uses /quick-corner). */
export async function GET(request: NextRequest) {
  return handleOutletMiddlewareSalesRequest(request, { fixedProfile: "till" });
}
