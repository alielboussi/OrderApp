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
      userRolesUrl: baseFallback,
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
      userRolesUrl: `${projectBase}/editor?schema=public&table=user_roles`,
    };
  } catch {
    return {
      hasProject: false,
      authUsersUrl: baseFallback,
      outletsTableUrl: baseFallback,
      userRolesUrl: baseFallback,
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
              Follow this sequence to create an outlet user, link the outlet, wire warehouses, and expose items for
              outlet orders and stocktake.
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
              Flow: add Supabase auth user, link user to outlet, assign roles, map warehouses, then map items.
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
                <div className={styles.sequenceLabel}>Assign outlet roles</div>
                <div className={styles.sequenceHint}>Add user_roles rows for the outlet (ex: Outlet, Stocktake).</div>
                <button type="button" className={styles.sequenceButton} onClick={() => openExternal(supabaseLinks.userRolesUrl)}>
                  Open User Roles Table
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>4</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Link outlet to warehouse</div>
                <div className={styles.sequenceHint}>Set the outlet sales/receiving warehouse mapping.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/outlet-warehouse-assignments")}>
                  Open Outlet to Warehouse
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>5</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Map items to outlet warehouse</div>
                <div className={styles.sequenceHint}>Route items/ingredients/raws to the outlet warehouse for orders and stocktake.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/outlet-setup")}>
                  Open Item to Warehouse Assignments
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>6</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Enable item visibility for outlet orders</div>
                <div className={styles.sequenceHint}>Ensure items/variants are marked Show in outlet orders.</div>
                <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/catalog/manage")}>
                  Open Menu Items & Recipes
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>7</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Verify orders and stocktake</div>
                <div className={styles.sequenceHint}>Confirm items appear and stock periods are available.</div>
                <div className={styles.sequenceActions}>
                  <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/outlet-orders")}>
                    Open Outlet Orders
                  </button>
                  <button type="button" className={styles.sequenceButton} onClick={() => router.push("/Warehouse_Backoffice/stock-reports")}>
                    Open Stock Reports
                  </button>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.actionsGrid}>
          <button type="button" className={styles.actionCard} onClick={() => router.push("/Warehouse_Backoffice/outlet-setup")}>
            <p className={styles.cardTitle}>Item to Warehouse Assignments</p>
            <p className={styles.cardBody}>Deduction routing for items, ingredients, and raws.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
          <button type="button" className={styles.actionCard} onClick={() => router.push("/Warehouse_Backoffice/outlet-warehouse-assignments")}>
            <p className={styles.cardTitle}>Outlet to Warehouse Setup</p>
            <p className={styles.cardBody}>Attach outlets to sales/receiving warehouses and stocktake.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
          <button type="button" className={styles.actionCard} onClick={() => router.push("/Warehouse_Backoffice/catalog/manage")}>
            <p className={styles.cardTitle}>Menu Items & Recipes</p>
            <p className={styles.cardBody}>Manage item visibility and recipe flags.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
          <button type="button" className={styles.actionCard} onClick={() => router.push("/Warehouse_Backoffice/outlet-orders")}>
            <p className={styles.cardTitle}>Outlet Orders</p>
            <p className={styles.cardBody}>Verify order creation and totals.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
        </section>
      </main>
    </div>
  );
}
