# Afterten Orders App

Android app built with Kotlin and Jetpack Compose. Integrates with Supabase (PostgREST + Storage) using a custom outlet-based authentication (no Supabase Auth). Phase 1 delivers login and home navigation plus backend schema and RLS.

## Prerequisites
- Android Studio (JDK 17)
- Supabase project

## Configure build
Create or update `gradle.properties` (in the project root or your global Gradle home) with:

```
SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (anon key)
```

Never commit service role keys to the app. Only the anon key belongs in the client.

## Apply database schema
Run the SQL in `supabase/schema.sql` in your Supabase SQL editor. This creates tables, RLS policies, and RPC functions for:
- `outlet_login(email, password)` → returns a signed JWT and outlet info
- `next_order_number(outlet_id)` → atomically increments per-outlet sequence
- `place_order(...)` → inserts orders and order_items within a single transaction

Also create Storage buckets:
- `assets` (public read) for static assets (e.g. company seal at `assets/seal.png`)
- `order-pdfs` (private) for uploaded order PDFs

## Run
Open in Android Studio and run. First launch shows Outlet Login; after successful login, you land on Home with the outlet name and a Create New Order button (Phase 2 will implement the full ordering flow).

## Notes
- Passwords are stored hashed via `pgcrypto` (bcrypt) on the database. Never send/store plaintext.
- JWTs include `role=outlet` and `outlet_id` claims so RLS can restrict access.
- Africa/Lusaka timezone handling and PDF generation will be implemented in Phase 2.

## Troubleshooting: No suitable key or wrong key type
If the Products screen shows an error like:

> No suitable key or wrong key type

your login RPC is signing the JWT with a different secret than PostgREST expects. Fix it by configuring the same JWT secret in both places:

1) In the Supabase dashboard, go to Settings → API and copy the "JWT Secret" (not the anon/service keys).

2) In SQL, set the DB parameter so `outlet_login` can read it:

```sql
alter database postgres set app.settings.jwt_secret = '<YOUR_JWT_SECRET>';  -- paste from Settings → API
```

Alternatively, edit `supabase/schema.sql` and replace the placeholder `v_secret` value in `outlet_login` with your JWT secret, then re-run the function creation block:

```sql
v_secret text := '<YOUR_JWT_SECRET>';
```

After updating the secret, re-run the login and the Products fetch should work. The app now also surfaces PostgREST error messages directly instead of a JSON parsing stack trace.
