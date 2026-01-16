"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import styles from "./login.module.css";

const allowedRoleId = "6b9e657a-6131-4a0b-8afa-0ce260f8ed0c";
const allowedSlug = "Administrator";
const allowedUserIds = new Set(["8d4feee9-c61b-44e2-80e9-fa264075fca3"]);

function buildClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase URL and anon key are required");
  }
  return createClient(url, anon, { auth: { persistSession: true } });
}

export default function WarehouseBackofficeLogin() {
  const router = useRouter();
  const supabase = useMemo(() => buildClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const user = data?.user ?? (await supabase.auth.getUser()).data.user;
      const userId = user?.id ?? "";
      const meta = { ...(user?.app_metadata || {}), ...(user?.user_metadata || {}) } as Record<string, unknown>;
      const roleId = String(meta.role_id ?? meta.roleId ?? meta.role ?? "").trim();
      const roleSlug = String(meta.role_slug ?? meta.roleSlug ?? meta.role ?? "").trim();
      const roleSlugLower = roleSlug.toLowerCase();
      const allowed = allowedUserIds.has(userId) || roleId == allowedRoleId || (roleSlug && roleSlugLower == allowedSlug.toLowerCase());

      if (!allowed) {
        await supabase.auth.signOut();
        throw new Error("Access denied. Only administrators can enter.");
      }

      router.push("/Warehouse_Backoffice");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to log in";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.kicker}>AfterTen Logistics</p>
          <h1 className={styles.title}>Warehouse Backoffice Login</h1>
          <p className={styles.subtitle}>Only administrators may enter this console.</p>
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
            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Enter backoffice"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

input:focus {
  border-color: #ff6b6b;
  box-shadow: 0 0 0 3px rgba(255,107,107,0.25);
}
`;
