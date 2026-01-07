"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

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
    <div style={styles.page}>
      <style>{globalStyles}</style>
      <main style={styles.shell}>
        <section style={styles.card}>
          <p style={styles.kicker}>AfterTen Logistics</p>
          <h1 style={styles.title}>Warehouse Backoffice Login</h1>
          <p style={styles.subtitle}>Only administrators may enter this console.</p>
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>
              Email
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label style={styles.label}>
              Password
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error ? <p style={styles.error}>{error}</p> : null}
            <button style={styles.submit} type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Enter backoffice"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "radial-gradient(circle at 20% 20%, #182647, #060b16 70%)",
    padding: "24px",
    color: "#f4f6ff",
    fontFamily: '"Space Grotesk", "Segoe UI", system-ui, sans-serif',
  },
  shell: {
    width: "100%",
    maxWidth: 520,
  },
  card: {
    background: "rgba(6,11,22,0.85)",
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.12)",
    padding: 28,
    boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
  },
  kicker: {
    margin: 0,
    fontSize: 13,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: "#8da2ff",
  },
  title: {
    margin: "10px 0 6px",
    fontSize: 32,
    fontWeight: 700,
  },
  subtitle: {
    margin: "0 0 18px",
    color: "#c6d2ff",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  label: {
    fontSize: 14,
    color: "#cdd6f4",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.04)",
    color: "#f8fafc",
    outline: "none",
  },
  submit: {
    marginTop: 6,
    padding: "14px 18px",
    borderRadius: 14,
    border: "1px solid #ff1b2d",
    background: "linear-gradient(120deg, #ff1b2d, #ff6b6b)",
    color: "#fff",
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  error: {
    color: "#ff8b99",
    margin: 0,
    fontSize: 14,
  },
};

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
