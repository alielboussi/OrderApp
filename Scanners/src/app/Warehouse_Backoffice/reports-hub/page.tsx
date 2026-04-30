"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../dashboard.module.css";
import menuStyles from "../menu.module.css";

export default function WarehouseBackofficeReportsHub() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const goToOutletSales = () => router.push("/Warehouse_Backoffice/reports");
  const goToOutletOrders = () => router.push("/Warehouse_Backoffice/outlet-orders");
  const goToScannerReports = () => router.push("/Warehouse_Backoffice/inventory");
  const goToStockReports = () => router.push("/Warehouse_Backoffice/stock-reports");
  const goToWarehouseReports = () => router.push("/Warehouse_Backoffice/warehouse-reports");
  const goToColdroomReports = () => router.push("/Warehouse_Backoffice/coldroom-reports");
  const goToVehicleReports = () => router.push("/Warehouse_Backoffice/vehicle-reports");
  const goToDifferences = () => router.push("/Warehouse_Backoffice/Differences");
  const goToProductionDifferences = () => router.push("/Warehouse_Backoffice/production-differences");

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Reports</h1>
            <p className={styles.subtitle}>Sales, orders, scanner activity, and stock reporting.</p>
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

        <section className={styles.actionsGrid}>
          <button onClick={goToOutletSales} className={`${styles.actionCard} ${styles.reportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.reportsTitle}`}>Outlet Sales Reports</p>
            <p className={styles.cardBody}>Filter sales by outlet, date, and product type with before/after tax totals.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletOrders} className={`${styles.actionCard} ${styles.mappingCard}`}>
            <p className={`${styles.cardTitle} ${styles.mappingTitle}`}>Outlet Orders Reports</p>
            <p className={styles.cardBody}>Filter orders by outlet and date, then download offloaded PDFs.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToScannerReports} className={`${styles.actionCard} ${styles.inventoryCard}`}>
            <p className={`${styles.cardTitle} ${styles.inventoryTitle}`}>Scanner Reports</p>
            <p className={styles.cardBody}>Process transfers, purchases, and damages with the new warehouse roles.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToStockReports} className={`${styles.actionCard} ${styles.stockReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.stockReportsTitle}`}>Stock Reports</p>
            <p className={styles.cardBody}>Review stocktake periods for mapped warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToWarehouseReports} className={`${styles.actionCard} ${styles.warehouseReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.warehouseReportsTitle}`}>Warehouse Reports</p>
            <p className={styles.cardBody}>See assigned products and accrued movement totals by date range.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToColdroomReports} className={`${styles.actionCard} ${styles.coldroomReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.coldroomReportsTitle}`}>Coldroom Reports</p>
            <p className={styles.cardBody}>Filter coldroom accrued units by date, product, and warehouse.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToVehicleReports} className={`${styles.actionCard} ${styles.vehicleReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.vehicleReportsTitle}`}>Vehicle Reports</p>
            <p className={styles.cardBody}>Track product transfers to vehicles with driver and plate filters.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToDifferences} className={`${styles.actionCard} ${styles.stockReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.stockReportsTitle}`}>Opening Stock Differences</p>
            <p className={styles.cardBody}>Compare opening ingredient counts with recipe-based servings.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToProductionDifferences} className={`${styles.actionCard} ${styles.warehouseReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.warehouseReportsTitle}`}>Production Differences</p>
            <p className={styles.cardBody}>Compare max producible servings with recorded production entries.</p>
            <span className={styles.cardCta}>Open</span>
          </button>
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
