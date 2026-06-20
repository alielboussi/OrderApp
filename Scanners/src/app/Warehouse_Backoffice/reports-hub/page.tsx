"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../enterprise.module.css";

const REPORT_LINKS = [
  { label: "Outlet Sales", href: "/Warehouse_Backoffice/reports", tone: "blue" as const, desc: "Filter sales by outlet, date, and product." },
  { label: "Outlet Orders", href: "/Warehouse_Backoffice/outlet-orders", tone: "gold" as const, desc: "Filter orders by outlet and date." },
  { label: "Warehouse History", href: "/Warehouse_Backoffice/inventory", tone: "green" as const, desc: "Transfers, purchases, and damages." },
  { label: "Stock Reports", href: "/Warehouse_Backoffice/stock-reports", tone: "blue" as const, desc: "Stocktake periods for mapped warehouses." },
  { label: "Movement Reports", href: "/Warehouse_Backoffice/warehouse-reports", tone: "gold" as const, desc: "Movement totals by date range." },
  { label: "Flow Traces", href: "/Warehouse_Backoffice/flow-traces", tone: "blue" as const, desc: "Audit stock deductions." },
  { label: "Negative Balances", href: "/Warehouse_Backoffice/negative-balance-reports", tone: "red" as const, desc: "Shortage alerts during deductions." },
  { label: "POS Sync Failures", href: "/Warehouse_Backoffice/pos-sync-failures", tone: "red" as const, desc: "Failed POS sync events by outlet." },
  { label: "Stock Period Exceptions", href: "/Warehouse_Backoffice/stock-period-exceptions", tone: "gold" as const, desc: "Missing open or closing counts." },
  { label: "Outlet Shortages", href: "/Warehouse_Backoffice/outlet-shortage-details", tone: "red" as const, desc: "Outlet shortage detail drill-down." },
];

const cardBorder: Record<string, string> = {
  blue: "#bfdbfe",
  green: "#bbf7d0",
  gold: "#fde68a",
  red: "#fecaca",
};

const cardBg: Record<string, string> = {
  blue: "#eff6ff",
  green: "#ecfdf3",
  gold: "#fffbeb",
  red: "#fef2f2",
};

export default function WarehouseBackofficeReportsHub() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}
    >
      {REPORT_LINKS.map((link) => (
        <button
          key={link.href}
          type="button"
          onClick={() => router.push(link.href)}
          className={styles.pageCard}
          style={{
            textAlign: "left",
            cursor: "pointer",
            borderColor: cardBorder[link.tone],
            background: cardBg[link.tone],
          }}
        >
          <p className={styles.pageCardTitle}>{link.label}</p>
          <p className={styles.pageCardBody}>{link.desc}</p>
        </button>
      ))}
    </div>
  );
}
