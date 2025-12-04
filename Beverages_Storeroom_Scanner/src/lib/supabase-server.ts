import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required on the server.');
  }
  return url;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side requests.');
  }
  return key;
}

export function getServiceClient(): SupabaseClient {
  if (client) {
    return client;
  }

  client = createClient(getSupabaseUrl(), getServiceKey(), {
    auth: { persistSession: false },
    global: {
      headers: { 'x-client-info': 'vercel-stock-app/1.0' },
    },
  });

  return client;
}
