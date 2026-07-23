"use client";

import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../enterprise.module.css";

export default function WarehouseBackofficeReportsHub() {
  const { status } = useWarehouseAuth();

  if (status !== "ok") return null;

  return (
    <section className={styles.pageCard}>
      <h3 className={styles.pageCardTitle} style={{ marginTop: 0 }}>
        Reports Hub
      </h3>
      <p className={styles.pageCardBody}>
        Reports will be added here one by one as they are designed.
      </p>
    </section>
  );
}
