"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";

export default function CatalogMenu() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  const go = (path: string) => router.push(path);
  const back = () => router.push("/Warehouse_Backoffice/inventory");

  return (
    <div style={styles.page}>
      <style>{globalStyles}</style>
      <main style={styles.shell}>
        <header style={styles.hero}>
          <div style={{ flex: 1 }}>
            <p style={styles.kicker}>AfterTen Logistics</p>
            <h1 style={styles.title}>Catalog Builder</h1>
            <p style={styles.subtitle}>Create products and their variants. Use the buttons below to open the forms.</p>
          </div>
          <button onClick={back} style={styles.backButton}>
            Back
          </button>
        </header>

        <section style={styles.actionsGrid}>
          <button
            onClick={() => go("/Warehouse_Backoffice/catalog/product")}
            style={{ ...styles.actionCard, borderColor: "#22c55eaa", boxShadow: "0 18px 44px #22c55e33" }}
          >
            <p style={{ ...styles.cardTitle, color: "#22c55e" }}>New Product</p>
            <p style={styles.cardBody}>Add a base product to catalog_items with clear units and defaults.</p>
            <span style={styles.cardCta}>Open form</span>
          </button>
          <button
            onClick={() => go("/Warehouse_Backoffice/catalog/variant")}
            style={{ ...styles.actionCard, borderColor: "#7dd3fcaa", boxShadow: "0 18px 44px #7dd3fc33" }}
          >
            <p style={{ ...styles.cardTitle, color: "#7dd3fc" }}>New Variant</p>
            <p style={styles.cardBody}>Attach a variant to an existing product in catalog_variants.</p>
            <span style={styles.cardCta}>Open form</span>
          </button>
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    borderRadius: 32,
    border: "1px solid rgba(255,255,255,0.1)",
    padding: 24,
    background: "rgba(6,11,22,0.8)",
    backdropFilter: "blur(16px)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
  },
  kicker: {
    margin: 0,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#8da2ff",
  },
  title: {
    margin: "8px 0 8px",
    fontSize: 40,
    letterSpacing: -0.5,
    fontWeight: 700,
  },
  subtitle: {
    margin: 0,
    color: "#c6d2ff",
    maxWidth: 540,
    lineHeight: 1.5,
  },
  backButton: {
    background: "transparent",
    color: "#f8fafc",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 600,
    letterSpacing: 1,
    cursor: "pointer",
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
    background: "rgba(12,17,33,0.9)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "inherit",
    transition: "transform 180ms ease, box-shadow 180ms ease",
    width: "6.5cm",
    minHeight: "6.5cm",
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
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#f8fafc",
  },
};

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button { background: none; border: none; }
button:hover { transform: translateY(-2px); }
`;
