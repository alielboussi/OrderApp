"use client";

import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "./useWarehouseAuth";
import styles from "./dashboard.module.css";

export default function WarehouseBackofficeDashboard() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const goToInventory = () => router.push("/Warehouse_Backoffice/inventory");
  const goToCatalog = () => router.push("/Warehouse_Backoffice/catalog");
  const goToCatalogManage = () => router.push("/Warehouse_Backoffice/catalog/manage");
  const goToOutletSetup = () => router.push("/Warehouse_Backoffice/outlet-setup");
  const goToPosMatch = () => router.push("/Warehouse_Backoffice/catalog/pos-item-map");
  const goToOutletBalances = () => router.push("/Warehouse_Backoffice/outlet-warehouse-balances");
  const goToOutletWarehouseAssignments = () => router.push("/Warehouse_Backoffice/outlet-warehouse-assignments");
  const goToReports = () => router.push("/Warehouse_Backoffice/reports");
  const goToVariantBulkUpdate = () => router.push("/Warehouse_Backoffice/variant-bulk-update");
  const goToStockReports = () => router.push("/Warehouse_Backoffice/stock-reports");
  const goToSuppliers = () => router.push("/Warehouse_Backoffice/suppliers");


  if (status !== "ok") {
    return null;
  }
  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Warehouse Backoffice</h1>
            <p className={styles.subtitle}>
              Configure outlet defaults, per-item routing, and POS match against the new warehouse schema. Operate inventory without legacy outlet-warehouse tables.
            </p>
            <p className={styles.shortcutNote}>Logs shortcut: Ctrl + Alt + Space, then X.</p>
          </div>
        </header>

        <section className={styles.setupBanner}>
          <div className={styles.setupHeader}>
            <h2 className={styles.setupTitle}>Stocktake setup sequence</h2>
            <p className={styles.setupSubtitle}>Follow these steps in order to make a warehouse and its ingredients/raws appear in the Stocktake app.</p>
          </div>
          <ol className={styles.setupSteps}>
            <li className={styles.setupStep}>
              <span className={styles.setupIndex}>1</span>
              <div className={styles.setupContent}>
                <div className={styles.setupLabel}>Add ingredient or raw</div>
                <div className={styles.setupHint}>Create the item first so it can be mapped to outlets and stocktake.</div>
                <button type="button" className={styles.setupLink} onClick={goToCatalogManage}>Open Menu Items & Recipes</button>
              </div>
            </li>
            <li className={styles.setupStep}>
              <span className={styles.setupIndex}>2</span>
              <div className={styles.setupContent}>
                <div className={styles.setupLabel}>Enable warehouse in stocktake</div>
                <div className={styles.setupHint}>Assign outlet to warehouse and set Show in stocktake = Yes.</div>
                <button type="button" className={styles.setupLink} onClick={goToOutletWarehouseAssignments}>Open Outlet → Warehouse Assignments</button>
              </div>
            </li>
            <li className={styles.setupStep}>
              <span className={styles.setupIndex}>3</span>
              <div className={styles.setupContent}>
                <div className={styles.setupLabel}>Map ingredient/raw to outlet warehouse</div>
                <div className={styles.setupHint}>Use the ingredient/raw dropdowns and save mappings.</div>
                <button type="button" className={styles.setupLink} onClick={goToOutletSetup}>Open Item To Warehouse Assignments</button>
              </div>
            </li>
            <li className={styles.setupStep}>
              <span className={styles.setupIndex}>4</span>
              <div className={styles.setupContent}>
                <div className={styles.setupLabel}>Verify stocktake periods</div>
                <div className={styles.setupHint}>Confirm the warehouse appears and periods can open/close.</div>
                <button type="button" className={styles.setupLink} onClick={goToStockReports}>Open Stock Reports</button>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.actionsGrid}>
          <button onClick={goToOutletSetup} className={`${styles.actionCard} ${styles.routingCard}`}>
            <p className={`${styles.cardTitle} ${styles.routingTitle}`}>Item To Warehouse Assignments</p>
            <p className={styles.cardBody}>Set outlet sales defaults, per-item routing, and product storage homes in one flow.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletBalances} className={`${styles.actionCard} ${styles.balanceCard}`}>
            <p className={`${styles.cardTitle} ${styles.balanceTitle}`}>Outlet Warehouse Balances</p>
            <p className={styles.cardBody}>Track live ingredient and raw stock remaining for outlet warehouses.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToOutletWarehouseAssignments} className={`${styles.actionCard} ${styles.assignmentsCard}`}>
            <p className={`${styles.cardTitle} ${styles.assignmentsTitle}`}>Outlet → Warehouse Setup</p>
            <p className={styles.cardBody}>Assign outlets to warehouses for stock periods and POS validation.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToCatalog} className={`${styles.actionCard} ${styles.catalogCard}`}>
            <p className={`${styles.cardTitle} ${styles.catalogTitle}`}>Menu Items & Recipes</p>
            <p className={styles.cardBody}>Manage items, variants, and recipes that drive outlet_item_routes and storage homes.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToPosMatch} className={`${styles.actionCard} ${styles.mappingCard}`}>
            <p className={`${styles.cardTitle} ${styles.mappingTitle}`}>MIntpos-App Match</p>
            <p className={styles.cardBody}>Map POS items/flavours to catalog item + variant + warehouse for deductions.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToReports} className={`${styles.actionCard} ${styles.reportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.reportsTitle}`}>Outlet Sales Reports</p>
            <p className={styles.cardBody}>Filter sales by outlet, date, and product type with before/after tax totals.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToInventory} className={`${styles.actionCard} ${styles.inventoryCard}`}>
            <p className={`${styles.cardTitle} ${styles.inventoryTitle}`}>Scanner Reports</p>
            <p className={styles.cardBody}>Process transfers, purchases, and damages with the new warehouse roles.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToVariantBulkUpdate} className={`${styles.actionCard} ${styles.bulkCard}`}>
            <p className={`${styles.cardTitle} ${styles.bulkTitle}`}>Bulk Variant Update</p>
            <p className={styles.cardBody}>Apply a single value to multiple variants in one step.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToSuppliers} className={`${styles.actionCard} ${styles.suppliersCard}`}>
            <p className={`${styles.cardTitle} ${styles.suppliersTitle}`}>Suppliers</p>
            <p className={styles.cardBody}>Create supplier contacts for purchase intake and scanner logs.</p>
            <span className={styles.cardCta}>Open</span>
          </button>

          <button onClick={goToStockReports} className={`${styles.actionCard} ${styles.stockReportsCard}`}>
            <p className={`${styles.cardTitle} ${styles.stockReportsTitle}`}>Stock Reports</p>
            <p className={styles.cardBody}>Review stocktake periods for mapped warehouses.</p>
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
