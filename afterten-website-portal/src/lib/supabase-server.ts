import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("SUPABASE_URL is required when CLOUD_BACKEND=supabase");
  }
  return url;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when CLOUD_BACKEND=supabase");
  }
  return key;
}

/** Server-side Supabase client (service role). Never expose to the browser. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseAdmin;
}

/** Read-only mirror rows for migration verification / agent inspection. */
export async function listFirestoreMirrorDocuments(options: {
  collectionPath: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const { data, error } = await getSupabaseAdmin()
    .schema("firestore_mirror")
    .from("documents")
    .select("collection_path, document_id, data, exported_at")
    .eq("collection_path", options.collectionPath)
    .order("document_id")
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countFirestoreMirrorDocuments(collectionPath?: string) {
  let query = getSupabaseAdmin()
    .schema("firestore_mirror")
    .from("documents")
    .select("*", { count: "exact", head: true });

  if (collectionPath) {
    query = query.eq("collection_path", collectionPath);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
