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

function navItemActive(pathname: string, hash: string, href: string): boolean {
  const [itemPath, itemHash = ""] = href.split("#");
  if (pathname !== itemPath) {
    return itemPath !== "/Warehouse_Backoffice" && pathname.startsWith(itemPath);
  }
  if (itemHash) return hash === itemHash;
  if (hash === "outlet-live-balances") return false;
  return href === pathname;
}

function usernameForEmail(email: string | null): string {
  if (!email) return "user";
  const normalized = email.trim().toLowerCase();
  if (normalized === "alielboussi00@gmail.com") return "Ali";
  if (normalized === "husseinelboussizam@gmail.com") return "Hussein";
  if (normalized === "mohammadalboussi@gmail.com") return "Mohammad";
  return email.split("@")[0] || "user";
}

export default function BackofficeShell({ children }: BackofficeShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash.replace(/^#/, ""));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      setEmail(user?.email ?? null);
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

  const pageTitle = pageTitleForPath(pathname ?? "", hash);
  const emailUsername = usernameForEmail(email);

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
                const active = navItemActive(pathname ?? "", hash, item.href);
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
          </div>
        </header>
        <div className={styles.welcomeBanner}>
          Welcome to the Afterten Portal, {emailUsername}
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
