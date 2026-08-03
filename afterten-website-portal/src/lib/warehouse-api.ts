import type { SupabaseClient } from "@supabase/supabase-js";
import { useFirebaseAuthClient } from "@/lib/cloud-backend-client";
import { getWarehouseAccessToken } from "@/lib/warehouse-auth-client";

export type PendingWarehouseAccount = {
  user_id: string;
  email: string | null;
  active: boolean;
  created_at: string;
  activated_at: string | null;
};

export async function warehouseAuthedFetch(
  supabase: SupabaseClient | null,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const token = useFirebaseAuthClient()
    ? await getWarehouseAccessToken()
    : (await supabase?.auth.getSession())?.data.session?.access_token;

  if (!token) {
    throw new Error("Not signed in");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
