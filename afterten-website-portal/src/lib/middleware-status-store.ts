import "server-only";

import { isSupabaseBackend } from "@/lib/cloud-backend";
import { getFirestoreMiddlewareStatus } from "@/lib/firestore-middleware-status";
import { getSupabaseMiddlewareStatus } from "@/lib/supabase-middleware-status";

export async function getMiddlewareStatus() {
  if (isSupabaseBackend()) return getSupabaseMiddlewareStatus();
  return getFirestoreMiddlewareStatus();
}
