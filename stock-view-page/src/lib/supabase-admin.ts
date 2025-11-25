import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Database = Record<string, never>; // leverage generated types later if available

let cachedClient: SupabaseClient<Database> | null = null;

function ensureEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Did you populate .env.local or configure Vercel env vars?`);
  }
  return value;
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = ensureEnv('SUPABASE_URL');
  const serviceKey = ensureEnv('SUPABASE_SERVICE_ROLE_KEY');

  cachedClient = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        // Helps Supabase identify the application when looking at logs
        'x-client-info': 'stock-view-page/1.0.0',
      },
    },
  });

  return cachedClient;
}

export const STOCK_VIEW_NAME = process.env.WAREHOUSE_STOCK_VIEW ?? 'warehouse_stock_current';
