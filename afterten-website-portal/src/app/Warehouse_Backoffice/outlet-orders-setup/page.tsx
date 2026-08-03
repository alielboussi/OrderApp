"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./outlet-orders-setup.module.css";

const FIREBASE_CONSOLE =
  "https://console.firebase.google.com/project/afterten-portal-system/firestore";

export default function OutletOrdersSetupPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

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
              Firebase workflow for the Android Orders app (Expo).
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button type="button" className={styles.backButton} onClick={() => router.back()}>
              Back
            </button>
            <button type="button" className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.sequenceCard}>
          <div className={styles.sequenceHeader}>
            <h2 className={styles.sequenceTitle}>New outlet setup (Firebase)</h2>
            <p className={styles.sequenceSubtitle}>
              Run from <code>C:\Projects\Afterten\firebase</code> on a machine with Admin SDK credentials.
            </p>
          </div>
          <ol className={styles.sequenceSteps}>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>1</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Seed outlet metadata</div>
                <div className={styles.sequenceHint}>
                  <code>node scripts/seed-outlets.cjs</code>
                </div>
                <button type="button" className={styles.sequenceButton} onClick={() => openExternal(FIREBASE_CONSOLE)}>
                  Open Firestore Console
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>2</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Create Firebase Auth user + app profile</div>
                <div className={styles.sequenceHint}>
                  <code>node scripts/seed-orders-app.cjs</code> — creates Auth user, <code>app_users/{"{uid}"}</code>, and
                  sample <code>outlet_order_catalog</code> rows.
                </div>
                <button
                  type="button"
                  className={styles.sequenceButton}
                  onClick={() =>
                    openExternal(
                      "https://console.firebase.google.com/project/afterten-portal-system/authentication/users"
                    )
                  }
                >
                  Open Firebase Auth Users
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>3</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Set roles on app_users</div>
                <div className={styles.sequenceHint}>
                  In Firestore <code>app_users/{"{uid}"}</code>: set <code>roles</code> to{" "}
                  <code>["branch"]</code> for outlet staff, or add <code>"supervisor"</code> /{" "}
                  <code>"warehouse_admin"</code> for supervisor queue access. Set <code>active: true</code>.
                </div>
                <button type="button" className={styles.sequenceButton} onClick={() => openExternal(FIREBASE_CONSOLE)}>
                  Open app_users
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>4</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Configure outlet + catalog for Orders app</div>
                <div className={styles.sequenceHint}>
                  Use Outlet Catalog Access — assign Firebase Auth UID and tick products/variants/ingredients.
                  Save pushes to <code>outlet_order_catalog</code> and <code>app_users</code>.
                </div>
                <button
                  type="button"
                  className={styles.sequenceButton}
                  onClick={() => router.push("/Warehouse_Backoffice/outlets/catalog-access")}
                >
                  Open Outlet Catalog Access
                </button>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>5</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Deploy Cloud Functions (if not already)</div>
                <div className={styles.sequenceHint}>
                  <code>firebase deploy --only firestore:rules,firestore:indexes,functions</code>
                </div>
              </div>
            </li>
            <li className={styles.sequenceStep}>
              <span className={styles.sequenceIndex}>6</span>
              <div className={styles.sequenceContent}>
                <div className={styles.sequenceLabel}>Verify in portal + Android app</div>
                <div className={styles.sequenceHint}>
                  Place a test order from Expo → confirm it appears in Outlet Orders backoffice with line items.
                </div>
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
