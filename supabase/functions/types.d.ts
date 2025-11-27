declare module 'https://deno.land/std@0.224.0/http/server.ts' {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.45.5' {
  export function createClient(
    supabaseUrl: string,
    serviceRoleKey: string,
    options?: Record<string, unknown>,
  ): any;
}

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};
