-- =============================================================================
-- Approve a warehouse backoffice user (Google or email/password)
-- =============================================================================
-- WHERE: Supabase SQL Editor (service role / postgres)
--
-- New sign-ups land in auth.users AND warehouse_auth_accounts with active=false.
-- Until active=true, login redirects with "pending approval".
--
-- Replace the email below, then run sections 1 → 2 → 3.
-- =============================================================================

-- 1) Find the account
SELECT
  u.id AS user_id,
  u.email,
  u.created_at AS auth_created_at,
  waa.active,
  waa.created_at AS warehouse_row_created_at,
  waa.activated_at
FROM auth.users u
LEFT JOIN public.warehouse_auth_accounts waa ON waa.user_id = u.id
WHERE lower(u.email) = lower('mohammadalboussi@gmail.com');  -- ← brother's email

-- 2) Approve (creates row if trigger missed it)
INSERT INTO public.warehouse_auth_accounts (user_id, email, active, activated_at)
SELECT u.id, u.email, true, NOW()
FROM auth.users u
WHERE lower(u.email) = lower('mohammadalboussi@gmail.com')
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  active = true,
  activated_at = COALESCE(public.warehouse_auth_accounts.activated_at, NOW()),
  updated_at = NOW();

-- 3) Verify
SELECT user_id, email, active, activated_at, updated_at
FROM public.warehouse_auth_accounts
WHERE lower(email) = lower('mohammadalboussi@gmail.com');
