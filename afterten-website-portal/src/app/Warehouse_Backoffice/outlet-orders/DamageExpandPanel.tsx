"use client";

import { useEffect, useState } from "react";
import type { DamageReportLineRow } from "@/lib/firestore-damage-reports";
import styles from "./outlet-orders.module.css";

type DamageExpandPanelProps = {
  reportId: string;
  onError: (message: string) => void;
};

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function DamageExpandPanel({ reportId, onError }: DamageExpandPanelProps) {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<DamageReportLineRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        onError("");
        const res = await fetch(`/api/outlet-damages/${encodeURIComponent(reportId)}/lines`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { lines?: DamageReportLineRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Unable to load damaged items");
        if (!active) return;
        setLines(json.lines ?? []);
      } catch (err) {
        if (!active) return;
        onError(err instanceof Error ? err.message : "Unable to load damaged items");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [onError, reportId]);

  if (loading) {
    return <div className={styles.expandPanel}>Loading damaged items…</div>;
  }

  if (lines.length === 0) {
    return <div className={styles.expandPanel}>No damaged items found.</div>;
  }

  return (
    <div className={styles.expandPanel}>
      <div className={styles.damageLinesTable}>
        <div className={`${styles.damageLineRow} ${styles.damageLineHead}`}>
          <span>Product</span>
          <span className={styles.alignRight}>Qty</span>
          <span>UOM</span>
        </div>
        {lines.map((line) => (
          <div key={line.id} className={styles.damageLineRow}>
            <span>{line.name ?? "Item"}</span>
            <span className={styles.alignRight}>{formatQty(line.qty ?? 0)}</span>
            <span>{line.uom ?? "Pc(s)"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
