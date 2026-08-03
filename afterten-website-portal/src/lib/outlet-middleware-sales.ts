import { NextRequest, NextResponse } from "next/server";
import { handleOutletMiddlewareSalesRequestFirebase } from "@/lib/outlet-middleware-sales-firebase";
import type { MiddlewareSalesApiProfile } from "@/lib/outletScope";

export const API_FORMAT_VERSION = 2;

export async function handleOutletMiddlewareSalesRequest(
  request: NextRequest,
  options?: { fixedProfile?: MiddlewareSalesApiProfile },
) {
  return handleOutletMiddlewareSalesRequestFirebase(request, options);
}
