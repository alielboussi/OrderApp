import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  // Use bracket access to avoid Next/Turbopack compile-time inlining so runtime env changes take effect.
  const url = process.env.SUPABASE_URL ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
  if (!url) {
    throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required on the server.');
  }
  return url;
}

function getServiceKey(): string {
  const serviceKeyCandidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_API_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_SECRET,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
  ];
  for (const candidate of serviceKeyCandidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const anonTrimmed = anonKey?.trim();
  if (!anonTrimmed) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or anon key fallback) is required for server-side requests.');
  }

  console.warn('[supabase-server] Falling back to anonymous key; set SUPABASE_SERVICE_ROLE_KEY for elevated access.');
  return anonTrimmed;
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
