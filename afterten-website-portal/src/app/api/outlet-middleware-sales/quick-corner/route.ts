import { NextRequest } from "next/server";
import { handleOutletMiddlewareSalesRequest } from "@/lib/outlet-middleware-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Quick Corner middleware sales export (same JSON format as Till route). */
export async function GET(request: NextRequest) {
  return handleOutletMiddlewareSalesRequest(request, { fixedProfile: "quick_corner" });
}
