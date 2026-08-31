-- Per-outlet bearer token for SCPGT → portal API (service role stays server-side only).

ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS middleware_api_token text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_outlets_middleware_api_token
  ON public.outlets (middleware_api_token)
  WHERE middleware_api_token IS NOT NULL;

COMMENT ON COLUMN public.outlets.middleware_api_token IS
  'Bearer token for SCPGT portal proxy (/api/middleware/supabase). Rotate via scripts/generate-middleware-tokens.cjs';
