"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./outlet-orders-setup.module.css";

function buildSupabaseUrls() {
  const baseFallback = "https://supabase.com/dashboard";
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) {
    return {
      hasProject: false,
      authUsersUrl: baseFallback,
      outletsTableUrl: baseFallback,
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname || "";
    const projectRef = host.split(".")[0] || "";
    if (!projectRef) {
      return {
        hasProject: false,
        authUsersUrl: baseFallback,
        outletsTableUrl: baseFallback,
        userRolesUrl: baseFallback,
      };
    }

    const projectBase = `https://supabase.com/dashboard/project/${projectRef}`;
    return {
      hasProject: true,
      authUsersUrl: `${projectBase}/auth/users`,
      outletsTableUrl: `${projectBase}/editor?schema=public&table=outlets`,
    };
  } catch {
    return {
      hasProject: false,
      authUsersUrl: baseFallback,
      outletsTableUrl: baseFallback,
    };
  }
}

export default function OutletOrdersSetupPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabaseLinks = useMemo(() => buildSupabaseUrls(), []);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet Orders Setup</h1>
            <p className={styles.subtitle}>
              Follow this sequence to create an outlet user, link the outlet, and expose catalog items for outlet orders.
            </p>
            {!supabaseLinks.hasProject && (
              <p className={styles.notice}>Set NEXT_PUBLIC_SUPABASE_URL to enable direct Supabase dashboard links.</p>
            )}
          </div>
          <div className={styles.headerButtons}>
            <button type="button" className={styles.backButton} onClick={() => router.back()}>
              Back
            </button>
            <button type="button" className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice") }>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.sequenceCard}>
          <div className={styles.sequenceHeader}>
            <h2 className={styles.sequenceTitle}>New Outlet Setup Sequence</h2>
            <p className={styles.sequenceSubtitle}>
              Flow: add Supabase auth user, link user to outlet, then expose catalog items for outlet orders.
            </p>
          </div>
          <ol className={styles.sequenceSteps}>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>1</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Create Supabase auth user</div>
                <div className={styles.sequenceHint}>Add the outlet user in Supabase Authentication.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => openExternal(supabaseLinks.authUsersUrl)}>
                  Open Auth Users
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>2</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Link user to outlet</div>
                <div className={styles.sequenceHint}>Set outlets.auth_user_id to the new auth user ID.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => openExternal(supabaseLinks.outletsTableUrl)}>
                  Open Outlets Table
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>3</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Optional: mark supervisor operators</div>
                <div className={styles.sequenceHint}>
                  Set user metadata role to <code>supervisor</code> on Auth users who should appear as operators.
                </div>
                <button type="button" className={styles.sequenceButton} onClick={() => openExternal(supabaseLinks.authUsersUrl)}>
                  Open Auth Users
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>4</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Enable item visibility for outlet orders</div>
                <div className={styles.sequenceHint}>Ensure items/variants are marked Show in outlet orders.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/catalog/menu")}>
                  Open Menu Items & Recipes
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>5</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Verify outlet orders</div>
                <div className={styles.sequenceHint}>Confirm items appear for the outlet ordering app.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/outlet-orders")}>
                  Open Outlet Orders
                </button>
              </div>
            </li>
          </ol>
        </section>

      </main>
    </div>
  );
}
