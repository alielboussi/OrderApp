"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../dashboard.module.css";
import menuStyles from "../menu.module.css";
import lockStyles from "./setup.module.css";

const SETUP_PASSWORD = "Lebanon1111$";
const SETUP_STORAGE_KEY = "warehouseSetupUnlocked";

export default function WarehouseBackofficeSetupPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(SETUP_STORAGE_KEY);
    if (stored === "true") setUnlocked(true);
  }, []);

  const handleUnlock = () => {
    if (password === SETUP_PASSWORD) {
      setUnlocked(true);
      setError("");
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(SETUP_STORAGE_KEY, "true");
      }
      return;
    }
    setError("Incorrect password.");
  };

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();


  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Setup</h1>
            <p className={styles.subtitle}>Assignments and mappings for outlets, warehouses, POS, and orders.</p>
          </div>
          <div className={menuStyles.headerButtons}>
            <button onClick={handleBackOne} className={menuStyles.backButton}>
              Back
            </button>
            <button onClick={handleBack} className={menuStyles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        {!unlocked ? (
          <section className={lockStyles.lockCard}>
            <h2 className={lockStyles.lockTitle}>Setup Locked</h2>
            <p className={lockStyles.lockHint}>Enter the setup password to access these tools.</p>
            <form
              className={lockStyles.lockForm}
              onSubmit={(event) => {
                event.preventDefault();
                handleUnlock();
              }}
            >
              <input
                type="password"
                className={lockStyles.lockInput}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" className={lockStyles.lockButton}>
                Unlock
              </button>
            </form>
            {error ? <p className={lockStyles.lockError}>{error}</p> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-2px);
}
`;
