import { NextRequest } from "next/server";
import { handleOutletMiddlewareSalesRequest } from "@/lib/outlet-middleware-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Till 1 & Till 2 middleware sales export (same JSON format as Quick Corner route). */
export async function GET(request: NextRequest) {
  return handleOutletMiddlewareSalesRequest(request, { fixedProfile: "till" });
}
