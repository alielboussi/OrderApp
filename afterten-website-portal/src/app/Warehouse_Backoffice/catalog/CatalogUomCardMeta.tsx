"use client";

import { formatCatalogUomDisplay } from "@/lib/catalog-uom-fields";
import {
  formatSupervisorUomConversionSummary,
  readSupervisorUomConversionFromRow,
} from "@/lib/supervisor-uom-conversion";
import type { UomOption } from "@/lib/use-uom-options";
import styles from "./CatalogUomCardMeta.module.css";

type UomRow = {
  orders_app_uom?: string | null;
  supervisor_uom?: string | null;
  orders_uom_conversion_qty?: number | null;
  supervisor_uom_conversion_qty?: number | null;
  supervisor_uom_qty_per_unit?: number | null;
};

type CatalogUomCardMetaProps = {
  row: UomRow;
  uomOptions: ReadonlyArray<UomOption>;
  highlightField?: "orders_app_uom" | "supervisor_uom" | null;
  editingNote?: string | null;
};

export function CatalogUomCardMeta({
  row,
  uomOptions,
  highlightField = null,
  editingNote = null,
}: CatalogUomCardMetaProps) {
  const outlet = formatCatalogUomDisplay(row.orders_app_uom, uomOptions);
  const supervisorRaw = formatCatalogUomDisplay(row.supervisor_uom, uomOptions);
  const supervisor = supervisorRaw || outlet;
  const conversion = readSupervisorUomConversionFromRow(row as Record<string, unknown>);
  const conversionSummary = formatSupervisorUomConversionSummary(conversion, outlet, supervisor);

  return (
    <div className={styles.uomMeta}>
      <div className={`${styles.uomRow} ${highlightField === "orders_app_uom" ? styles.uomRowHighlight : ""}`}>
        <span className={styles.uomLabel}>Outlet</span>
        <span className={styles.uomValue} title={outlet || undefined}>
          {outlet || "—"}
        </span>
      </div>
      <div className={`${styles.uomRow} ${highlightField === "supervisor_uom" ? styles.uomRowHighlight : ""}`}>
        <span className={styles.uomLabel}>Supervisor</span>
        <span className={styles.uomValue} title={supervisor || undefined}>
          {supervisor || "—"}
        </span>
      </div>
      <div className={styles.uomRow}>
        <span className={styles.uomLabel}>Conversion</span>
        <span className={styles.uomValue} title={conversionSummary}>
          {conversionSummary}
        </span>
      </div>
      {editingNote ? (
        <p className={styles.editingMeta}>
          <strong>Editing:</strong> {editingNote}
        </p>
      ) : null}
    </div>
  );
}
