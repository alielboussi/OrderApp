"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "./login.module.css";


async function isPlatformAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === "PGRST116") return false;
    throw error;
  }

  return Boolean(data?.user_id);
}

const READONLY_USER_ID = "fd52f4c1-2403-4670-bdd6-97b4ca7580aa";
const BACKOFFICE_ROLE_ID = "de9f2075-9c97-4da1-a2a0-59ed162947e7";

async function hasBackofficeRole(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .eq("role_id", BACKOFFICE_ROLE_ID)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "PGRST116") return false;
    throw error;
  }
  return Boolean(data?.role_id);
}

export default function WarehouseBackofficeLogin() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
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
      const allowed = userId
        ? (await isPlatformAdmin(supabase, userId)) || (await hasBackofficeRole(supabase, userId)) || userId === READONLY_USER_ID
        : false;

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
