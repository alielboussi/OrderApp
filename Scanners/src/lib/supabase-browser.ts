import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type GlobalWithSupabase = typeof globalThis & {
  __warehouseSupabaseClient?: SupabaseClient;
};

function getBrowserUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is required");
  return url;
}

function getBrowserAnonKey(): string {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) throw new Error("Supabase anon key is required");
  return anon;
}

export function getWarehouseBrowserClient(): SupabaseClient {
  const globalRef = globalThis as GlobalWithSupabase;
  if (!globalRef.__warehouseSupabaseClient) {
    globalRef.__warehouseSupabaseClient = createClient(getBrowserUrl(), getBrowserAnonKey(), {
      auth: {
        persistSession: true,
        storageKey: "sb-warehouse-backoffice",
      },
    });
  }
  return globalRef.__warehouseSupabaseClient;
}
