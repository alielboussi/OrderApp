"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFirebaseAuthClient } from "@/lib/cloud-backend-client";
import {
  getWarehouseAuthSession,
  warehouseSignInWithGoogle,
  warehouseSignInWithPassword,
  warehouseSignOut,
} from "@/lib/warehouse-auth-client";
import { requireActiveWarehouseAccountFromToken, WAREHOUSE_PENDING_APPROVAL_MESSAGE } from "@/lib/warehouse-account-api";
import styles from "./login.module.css";

export default function WarehouseBackofficeLogin() {
  const router = useRouter();
  const useFirebase = useFirebaseAuthClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (!authError) return;
    setError(decodeURIComponent(authError));
    // Clear stale Firebase/Supabase sessions that caused the redirect loop.
    void warehouseSignOut();
    window.history.replaceState({}, "", "/Warehouse_Backoffice/login");
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await warehouseSignInWithPassword(email, password);
      const session = await getWarehouseAuthSession();
      if (!session) throw new Error("Unable to establish session");

      const approval = await requireActiveWarehouseAccountFromToken(session.accessToken);
      if (!approval.ok) throw new Error(approval.message);

      router.push("/Warehouse_Backoffice");
    } catch (err) {
      let message = err instanceof Error ? err.message : "Unable to log in";
      if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
        message =
          "Invalid email or password. Supabase passwords were not migrated — use Google sign-in, or ask an admin to run firebase/scripts/set-warehouse-portal-password.cjs to set a new Firebase password.";
      } else if (message.includes("auth/user-not-found")) {
        message =
          "No Firebase account exists for this email. Use Google sign-in first, or run set-warehouse-portal-password.cjs to create one.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await warehouseSignInWithGoogle();
      if (useFirebase) {
        const session = await getWarehouseAuthSession();
        if (!session) throw new Error("Unable to establish session");
        const approval = await requireActiveWarehouseAccountFromToken(session.accessToken);
        if (!approval.ok) throw new Error(approval.message);
        router.push("/Warehouse_Backoffice");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start Google sign-in";
      setError(message);
      setGoogleLoading(false);
    }
  };

  const busy = loading || googleLoading;
  const pendingApproval = error === WAREHOUSE_PENDING_APPROVAL_MESSAGE;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.kicker}>AfterTen Logistics</p>
          <h1 className={styles.title}>Warehouse Backoffice Login</h1>
          <p className={styles.subtitle}>
            Sign in with Google or your {useFirebase ? "Firebase" : "Supabase"} account.
          </p>

          <button
            type="button"
            className={styles.googleButton}
            onClick={handleGoogleSignIn}
            disabled={busy}
          >
            <span className={styles.googleIcon} aria-hidden="true" />
            {googleLoading ? "Signing in with Google..." : "Continue with Google"}
          </button>
          <p className={styles.googleNote}>
            First-time Google sign-in creates your account, then an administrator must approve access.
            Email/password logins must be set up in Firebase (Supabase passwords were not migrated).
          </p>

          {error ? (
            <p className={pendingApproval ? styles.pendingApproval : styles.error} role="alert">
              {error}
            </p>
          ) : null}

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
            {error && !pendingApproval ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.submit} type="submit" disabled={busy}>
              {loading ? "Signing in..." : "Enter backoffice"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
