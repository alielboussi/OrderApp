import { NextRequest, NextResponse } from "next/server";
import { isSupabaseBackend } from "@/lib/cloud-backend";
import { handleOutletMiddlewareSalesRequestFirebase } from "@/lib/outlet-middleware-sales-firebase";
import { handleOutletMiddlewareSalesRequestSupabase } from "@/lib/outlet-middleware-sales-supabase";
import type { MiddlewareSalesApiProfile } from "@/lib/outletScope";

export const API_FORMAT_VERSION = 2;

export async function handleOutletMiddlewareSalesRequest(
  request: NextRequest,
  options?: { fixedProfile?: MiddlewareSalesApiProfile },
) {
  if (isSupabaseBackend()) {
    return handleOutletMiddlewareSalesRequestSupabase(request, options);
  }
  return handleOutletMiddlewareSalesRequestFirebase(request, options);
}
