"use client";

import { formatCatalogUomDisplay } from "@/lib/catalog-uom-fields";
import type { UomOption } from "@/lib/use-uom-options";
import styles from "./SupervisorUomConversionCard.module.css";

type SupervisorUomConversionCardProps = {
  ordersAppUom: string;
  supervisorUom: string;
  ordersUomConversionQty: string;
  supervisorUomConversionQty: string;
  uomOptions: ReadonlyArray<UomOption>;
  uomOptionsReady: boolean;
  disabled?: boolean;
  onSupervisorUomChange: (value: string) => void;
  onOrdersUomConversionQtyChange: (value: string) => void;
  onSupervisorUomConversionQtyChange: (value: string) => void;
};

export function SupervisorUomConversionCard({
  ordersAppUom,
  supervisorUom,
  ordersUomConversionQty,
  supervisorUomConversionQty,
  uomOptions,
  uomOptionsReady,
  disabled = false,
  onSupervisorUomChange,
  onOrdersUomConversionQtyChange,
  onSupervisorUomConversionQtyChange,
}: SupervisorUomConversionCardProps) {
  const ordersUomLabel = formatCatalogUomDisplay(ordersAppUom, uomOptions) || "Orders UOM";
  const supervisorUomLabel = formatCatalogUomDisplay(supervisorUom, uomOptions) || "Supervisor UOM";

  return (
    <div className={styles.card}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Supervisor</h3>
        <p className={styles.sectionHint}>
          Supervisors see qty in supervisor UOM on the dashboard and PDF. Outlets and WhatsApp stay on
          orders UOM.
        </p>
      </div>

      <div className={styles.referenceRow}>
        <span className={styles.referenceLabel}>Orders UOM</span>
        <span className={styles.referenceValue}>{ordersUomLabel || "—"}</span>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Supervisor Uom</span>
        <small className={styles.fieldHint}>Unit shown on supervisor order screens and warehouse PDF</small>
        <select
          className={styles.select}
          value={supervisorUom}
          onChange={(event) => onSupervisorUomChange(event.target.value)}
          disabled={disabled || !uomOptionsReady || uomOptions.length === 0}
        >
          {uomOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.equationBlock}>
        <p className={styles.equationLabel}>Qty conversion</p>
        <div className={styles.equationRow} aria-label="Supervisor UOM conversion equation">
          <input
            type="number"
            className={styles.qtyInput}
            value={ordersUomConversionQty}
            onChange={(event) => onOrdersUomConversionQtyChange(event.target.value)}
            min={1}
            step={1}
            disabled={disabled}
            aria-label={`Orders UOM quantity (${ordersUomLabel})`}
          />
          <span className={styles.uomChip}>{ordersUomLabel}</span>
          <span className={styles.operator} aria-hidden="true">
            =
          </span>
          <input
            type="number"
            className={styles.qtyInput}
            value={supervisorUomConversionQty}
            onChange={(event) => onSupervisorUomConversionQtyChange(event.target.value)}
            min={1}
            step={1}
            disabled={disabled}
            aria-label={`Supervisor UOM quantity (${supervisorUomLabel})`}
          />
          <span className={styles.uomChip}>{supervisorUomLabel}</span>
        </div>
        <p className={styles.equationHint}>
          Example: 10 Piece(s) = 1 Packet(s) — an outlet order of 10 pieces shows as 1 packet for
          supervisors.
        </p>
      </div>
    </div>
  );
}
