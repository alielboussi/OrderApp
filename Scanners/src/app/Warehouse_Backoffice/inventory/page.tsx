"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./inventory.module.css";

const actionCards = [
  {
    title: "Warehouse Transfers",
    body: "View all internal transfers.",
    cta: "Enter Transfers",
    path: "/Warehouse_Backoffice/transfers",
    className: "transfersCard",
  },
  {
    title: "Warehouse Damages",
    body: "Audit all damage deductions.",
    cta: "View Damages",
    path: "/Warehouse_Backoffice/damages",
    className: "damagesCard",
  },
  {
    title: "Warehouse Purchases",
    body: "Review received purchase receipts.",
    cta: "View Purchases",
    path: "/Warehouse_Backoffice/purchases",
    className: "purchasesCard",
  },
];

export default function InventoryMenu() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const handleNavigate = (path: string) => router.push(path);
  const handleBack = () => router.push("/Warehouse_Backoffice");

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Inventory</h1>
            <p className={styles.subtitle}>Choose a workspace to continue.</p>
          </div>
          <button onClick={handleBack} className={styles.backButton}>
            Back
          </button>
        </header>

        <section className={styles.actionsGrid}>
          <button onClick={handleBack} className={styles.backGhost}>Back to Dashboard</button>
          {actionCards.map((card) => (
            <button
              key={card.title}
              onClick={() => handleNavigate(card.path)}
              className={`${styles.actionCard} ${styles[card.className]}`}
            >
              <p className={`${styles.cardTitle} ${styles[`${card.className}Title`]}`}>{card.title}</p>
              <p className={styles.cardBody}>{card.body}</p>
              <span className={styles.cardCta}>{card.cta}</span>
            </button>
          ))}
        </section>
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
