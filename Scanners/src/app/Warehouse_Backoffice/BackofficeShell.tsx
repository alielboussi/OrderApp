"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "./useWarehouseAuth";
import { BACKOFFICE_NAV, pageTitleForPath, navGroupLabelClass } from "./navigation";
import styles from "./enterprise.module.css";

type BackofficeShellProps = {
  children: React.ReactNode;
};

export default function BackofficeShell({ children }: BackofficeShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      setEmail(user?.email ?? null);
      const meta = user?.user_metadata as { full_name?: string; name?: string; username?: string } | undefined;
      setDisplayName(meta?.full_name ?? meta?.name ?? meta?.username ?? null);
    });
    return () => {
      active = false;
    };
  }, [status, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/Warehouse_Backoffice/login");
  };

  if (status !== "ok") {
    return null;
  }

  const pageTitle = pageTitleForPath(pathname ?? "");

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <p className={styles.brandKicker}>AfterTen Logistics</p>
          <h1 className={styles.brandTitle}>Backoffice</h1>
        </div>
        <nav className={styles.nav} aria-label="Backoffice navigation">
          {BACKOFFICE_NAV.map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <p className={`${styles.navGroupLabel} ${group.tone ? styles[navGroupLabelClass(group.tone)] : ""}`}>
                {group.label}
              </p>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/Warehouse_Backoffice" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.signOutBtn} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>{pageTitle}</h2>
            {email ? (
              <p className={styles.headerMeta}>
                {displayName ? `${displayName} · ` : ""}
                {email}
              </p>
            ) : null}
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
