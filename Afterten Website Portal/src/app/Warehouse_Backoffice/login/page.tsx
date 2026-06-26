"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { requireActiveWarehouseAccount } from "@/lib/warehouse-account";
import styles from "./login.module.css";

function getOAuthCallbackUrl(): string {
  return `${window.location.origin}/Warehouse_Backoffice/auth/callback`;
}

export default function WarehouseBackofficeLogin() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (authError) {
      setError(decodeURIComponent(authError));
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const approval = await requireActiveWarehouseAccount(supabase);
      if (!approval.ok) throw new Error(approval.message);

      router.push("/Warehouse_Backoffice");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to log in";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getOAuthCallbackUrl(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start Google sign-in";
      setError(message);
      setGoogleLoading(false);
    }
  };

  const busy = loading || googleLoading;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.kicker}>AfterTen Logistics</p>
          <h1 className={styles.title}>Warehouse Backoffice Login</h1>
          <p className={styles.subtitle}>Sign in with Google or your Supabase Authentication user.</p>

          <button
            type="button"
            className={styles.googleButton}
            onClick={handleGoogleSignIn}
            disabled={busy}
          >
            <span className={styles.googleIcon} aria-hidden="true" />
            {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
          </button>

          <div className={styles.divider} role="separator" aria-label="or">
            <span>or</span>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.submit} type="submit" disabled={busy}>
              {loading ? "Signing in..." : "Enter backoffice"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
