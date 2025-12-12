"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";

const actionCards = [
  {
    title: "Warehouse Transfers",
    body: "View all internal transfers.",
    cta: "Enter Transfers",
    accent: "#ff1b2d",
    path: "/Warehouse_Backoffice/transfers",
    status: "live" as const,
  },
  {
    title: "Warehouse Damages",
    body: "Audit all damage deductions.",
    cta: "View Damages",
    accent: "#f97316",
    path: "/Warehouse_Backoffice/damages",
    status: "live" as const,
  },
  {
    title: "Warehouse Purchases",
    body: "Review received purchase receipts.",
    cta: "View Purchases",
    accent: "#22c55e",
    path: "/Warehouse_Backoffice/purchases",
    status: "live" as const,
  },
];

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const handleNavigate = (path: string, disabled: boolean) => {
    if (disabled) return;
    router.push(path);
  };

  if (status !== "ok") {
    return null;
  }

  return (
    <div style={styles.page}>
      <style>{globalStyles}</style>
      <main style={styles.shell}>
        <header style={styles.hero}>
          <div style={{ flex: 1 }}>
            <p style={styles.kicker}>AfterTen Logistics</p>
            <h1 style={styles.title}>Warehouse Backoffice</h1>
            <p style={styles.subtitle}>
              Choose where to work today. Transfers are live now; additional control rooms will plug in here soon.
            </p>
            <p style={styles.notice}>Live metrics will return once final dashboards are signed off.</p>
          </div>
        </header>

        <section style={styles.actionsGrid}>
          {actionCards.map((card) => (
            <button
              key={card.title}
              onClick={() => handleNavigate(card.path, card.status !== "live")}
              style={{
                ...styles.actionCard,
                borderColor: `${card.accent}66`,
                boxShadow: card.status === "live" ? `0 20px 40px ${card.accent}33` : "none",
                opacity: card.status === "live" ? 1 : 0.65,
                cursor: card.status === "live" ? "pointer" : "not-allowed",
              }}
            >
              <p style={{ ...styles.cardTitle, color: card.accent }}>{card.title}</p>
              <p style={styles.cardBody}>{card.body}</p>
              <span style={styles.cardCta}>{card.cta}</span>
            </button>
          ))}
        </section>

      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 20% 20%, #182647, #060b16 70%)",
    display: "flex",
    justifyContent: "center",
    padding: "40px 24px",
    color: "#f4f6ff",
    fontFamily: '"Space Grotesk", "Segoe UI", system-ui, sans-serif',
  },
  shell: {
    width: "100%",
    maxWidth: 1280,
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  hero: {
    display: "flex",
    gap: 32,
    borderRadius: 32,
    border: "1px solid rgba(255,255,255,0.1)",
    padding: 32,
    background: "rgba(6,11,22,0.75)",
    backdropFilter: "blur(16px)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
  },
  kicker: {
    margin: 0,
    fontSize: 14,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: "#8da2ff",
  },
  title: {
    margin: "8px 0 12px",
    fontSize: 48,
    letterSpacing: -1,
    fontWeight: 700,
  },
  subtitle: {
    margin: 0,
    color: "#c6d2ff",
    maxWidth: 640,
    lineHeight: 1.5,
  },
  notice: {
    marginTop: 28,
    fontSize: 14,
    color: "#7dd3fc",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(6.5cm, 1fr))",
    gap: 28,
    justifyItems: "center",
  },
  actionCard: {
    textAlign: "left",
    borderRadius: 32,
    padding: 24,
    background: "rgba(12,17,33,0.85)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "inherit",
    transition: "transform 180ms ease, box-shadow 180ms ease",
    width: "6cm",
    minHeight: "6cm",
    aspectRatio: "1 / 1",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 22,
    letterSpacing: 0.5,
    margin: "0 0 12px",
    fontWeight: 600,
  },
  cardBody: {
    margin: "0 0 20px",
    color: "#cbd5f5",
    lineHeight: 1.45,
  },
  cardCta: {
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#f8fafc",
  },
};

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
