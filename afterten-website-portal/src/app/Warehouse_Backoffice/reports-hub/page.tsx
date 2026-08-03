"use client";

import Link from "next/link";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../enterprise.module.css";

type ReportDefinition = {
  href: string;
  title: string;
  description: string;
  badge: string;
  icon: "sales";
};

const REPORTS: ReportDefinition[] = [
  {
    href: "/Warehouse_Backoffice/reports-hub/outlet-sales-detail",
    title: "Outlet Sales Detail",
    description:
      "Bill-level POS sales by outlet with line items, payment type, shift, and cashier.",
    badge: "POS",
    icon: "sales",
  },
];

const PLACEHOLDER_SLOTS = 3;

function ReportIcon({ kind }: { kind: ReportDefinition["icon"] }) {
  if (kind === "sales") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
}

export default function WarehouseBackofficeReportsHub() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return (
    <section className={styles.reportsHubShell}>
      <header className={styles.reportsHubIntro}>
        <h3 className={styles.reportsHubTitle}>Reports Hub</h3>
        <p className={styles.reportsHubLead}>
          Operational reports from synced POS middleware data. Select a report to run filters and export.
        </p>
      </header>

      <div className={styles.reportsHubGrid}>
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href} className={styles.reportHubCard}>
            <div className={styles.reportHubCardHeader}>
              <span className={styles.reportHubIcon}>
                <ReportIcon kind={report.icon} />
              </span>
              <span className={styles.reportHubBadge}>{report.badge}</span>
            </div>
            <h4 className={styles.reportHubCardTitle}>{report.title}</h4>
            <p className={styles.reportHubCardBody}>{report.description}</p>
            <p className={styles.reportHubCardFooter}>Open report →</p>
          </Link>
        ))}

        {Array.from({ length: PLACEHOLDER_SLOTS }).map((_, index) => (
          <div key={`placeholder-${index}`} className={styles.reportHubPlaceholder} aria-hidden="true">
            <p className={styles.reportHubPlaceholderLabel}>Coming soon</p>
          </div>
        ))}
      </div>
    </section>
  );
}
