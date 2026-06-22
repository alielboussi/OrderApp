"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchSellingOutlets, type SellingOutlet } from "@/lib/sellingOutlets";
import {
  type MiddlewareScheduleRow,
  formatCountdown,
  formatStamp,
  MIDDLEWARE_POLL_MS,
} from "./middlewareMonitorShared";
import styles from "./enterprise.module.css";

type ProductStat = {
  name: string;
  qty: number;
} | null;

type DashboardStats = {
  sales: {
    total_qty: number;
    total_revenue: number;
    most_sold: ProductStat;
    least_sold: ProductStat;
  };
  purchases: {
    total_qty: number;
    total_cost: number;
    most_purchased: ProductStat;
    least_purchased: ProductStat;
  };
  outlet_orders: {
    order_count: number;
    most_ordered: ProductStat;
    least_ordered: ProductStat;
  };
};

type StatTone = "blue" | "green" | "gold" | "red";

const TONE_CARD: Record<StatTone, string> = {
  blue: styles.dashboardStatCardBlue,
  green: styles.dashboardStatCardGreen,
  gold: styles.dashboardStatCardGold,
  red: styles.dashboardStatCardRed,
};

const TONE_LABEL: Record<StatTone, string> = {
  blue: styles.dashboardStatLabelBlue,
  green: styles.dashboardStatLabelGreen,
  gold: styles.dashboardStatLabelGold,
  red: styles.dashboardStatLabelRed,
};

function toDateInputValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function productLine(stat: ProductStat): string {
  if (!stat) return "No data";
  return `${stat.name} · ${formatQty(stat.qty)}`;
}

function StatCard({ tone, label, children }: { tone: StatTone; label: string; children: ReactNode }) {
  return (
    <div className={`${styles.dashboardStatCard} ${TONE_CARD[tone]}`}>
      <p className={`${styles.dashboardStatLabel} ${TONE_LABEL[tone]}`}>{label}</p>
      {children}
    </div>
  );
}

function StatsSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: StatTone;
  children: ReactNode;
}) {
  const titleClass =
    tone === "green"
      ? styles.dashboardStatsSectionTitleGreen
      : tone === "gold"
        ? styles.dashboardStatsSectionTitleGold
        : tone === "red"
          ? styles.dashboardStatsSectionTitleRed
          : styles.dashboardStatsSectionTitleBlue;

  return (
    <div className={styles.dashboardStatsSection}>
      <h4 className={`${styles.dashboardStatsSectionTitle} ${titleClass}`}>{title}</h4>
      <div className={styles.dashboardStatsGrid}>{children}</div>
    </div>
  );
}

export default function DashboardStatsPanel() {
  const today = useMemo(() => new Date(), []);
  const weekAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<MiddlewareScheduleRow | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [outlets, setOutlets] = useState<SellingOutlet[]>([]);
  const [selectedSalesOutletIds, setSelectedSalesOutletIds] = useState<string[]>([]);
  const [salesOutletsInitialized, setSalesOutletsInitialized] = useState(false);
  const [salesFrom, setSalesFrom] = useState(toDateInputValue(weekAgo));
  const [salesTo, setSalesTo] = useState(toDateInputValue(today));
  const [purchasesFrom, setPurchasesFrom] = useState(toDateInputValue(weekAgo));
  const [purchasesTo, setPurchasesTo] = useState(toDateInputValue(today));
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [outletLeaderId, setOutletLeaderId] = useState("");
  const [outletLeaderStats, setOutletLeaderStats] = useState<DashboardStats["sales"] | null>(null);
  const [outletLeaderLoading, setOutletLeaderLoading] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    const loadSchedule = async () => {
      try {
        const scheduleRes = await fetch("/api/middleware-catalog-schedule");
        if (!active) return;
        if (scheduleRes.ok) {
          const json = await scheduleRes.json();
          setSchedule((json.schedule ?? null) as MiddlewareScheduleRow | null);
        } else {
          setSchedule(null);
        }
        setLastChecked(new Date().toISOString());
      } catch {
        if (active) setSchedule(null);
      }
    };

    loadSchedule();
    const interval = window.setInterval(loadSchedule, MIDDLEWARE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchSellingOutlets()
      .then((rows) => {
        if (!active) return;
        setOutlets(rows);
        if (!salesOutletsInitialized) {
          setSelectedSalesOutletIds(rows.map((row) => row.id));
          setSalesOutletsInitialized(true);
        }
        if (!outletLeaderId && rows.length > 0) {
          const sorted = [...rows].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          );
          setOutletLeaderId(sorted[0].id);
        }
      })
      .catch(() => {
        if (active) setOutlets([]);
      });
    return () => {
      active = false;
    };
  }, [salesOutletsInitialized, outletLeaderId]);

  const sortedOutlets = useMemo(
    () => [...outlets].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [outlets],
  );

  const allSalesOutletsSelected =
    outlets.length > 0 && outlets.every((outlet) => selectedSalesOutletIds.includes(outlet.id));

  const toggleSalesOutlet = (outletId: string) => {
    setSelectedSalesOutletIds((prev) =>
      prev.includes(outletId) ? prev.filter((id) => id !== outletId) : [...prev, outletId],
    );
  };

  const toggleAllSalesOutlets = (checked: boolean) => {
    setSelectedSalesOutletIds(checked ? outlets.map((outlet) => outlet.id) : []);
  };

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const params = new URLSearchParams({
        sales_from: salesFrom,
        sales_to: salesTo,
        purchases_from: purchasesFrom,
        purchases_to: purchasesTo,
        orders_from: salesFrom,
        orders_to: salesTo,
      });
      params.set("sales_outlet_ids", selectedSalesOutletIds.join(","));

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Unable to load stats");
      setStats(json as DashboardStats);
    } catch (error) {
      setStats(null);
      setStatsError(error instanceof Error ? error.message : "Unable to load stats");
    } finally {
      setStatsLoading(false);
    }
  }, [salesFrom, salesTo, selectedSalesOutletIds, purchasesFrom, purchasesTo]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const loadOutletLeaderStats = useCallback(async () => {
    if (!outletLeaderId) {
      setOutletLeaderStats(null);
      return;
    }

    setOutletLeaderLoading(true);
    try {
      const params = new URLSearchParams({
        sales_from: salesFrom,
        sales_to: salesTo,
        sales_outlet_ids: outletLeaderId,
        purchases_from: salesFrom,
        purchases_to: salesTo,
        orders_from: salesFrom,
        orders_to: salesTo,
      });

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Unable to load outlet sales");
      setOutletLeaderStats((json as DashboardStats).sales);
    } catch {
      setOutletLeaderStats(null);
    } finally {
      setOutletLeaderLoading(false);
    }
  }, [outletLeaderId, salesFrom, salesTo]);

  useEffect(() => {
    void loadOutletLeaderStats();
  }, [loadOutletLeaderStats]);

  const countdown = formatCountdown(schedule?.scheduled_at ?? null, nowMs);
  const selectedLeaderOutlet = sortedOutlets.find((outlet) => outlet.id === outletLeaderId);

  return (
    <section className={styles.pageCard}>
      {statsError ? (
        <div className={styles.alertBanner} style={{ marginBottom: 12 }}>
          <strong>Stats:</strong> {statsError}
        </div>
      ) : null}

      <div className={styles.dashboardStatsSections}>
        <StatsSection title="Monitoring" tone="blue">
          <StatCard tone="blue" label="Last checked">
            <p className={styles.dashboardStatValue} style={{ fontSize: 13 }}>
              {formatStamp(lastChecked)}
            </p>
          </StatCard>

          <StatCard tone="blue" label="Scheduled release">
            <p className={styles.dashboardStatValue} style={{ fontSize: 15 }}>
              {countdown}
            </p>
            <p className={styles.dashboardStatMeta}>
              {schedule?.scheduled_at ? formatStamp(schedule.scheduled_at) : "No schedule set"}
            </p>
          </StatCard>
        </StatsSection>

        <StatsSection title="POS sales" tone="green">
          <StatCard tone="green" label="Sales">
            <div className={styles.dashboardStatsFilters}>
              <div className={styles.dashboardStatsOutletPanel}>
                <label className={styles.dashboardStatsOutletSelectAll}>
                  <input
                    type="checkbox"
                    checked={allSalesOutletsSelected}
                    onChange={(event) => toggleAllSalesOutlets(event.target.checked)}
                    disabled={outlets.length === 0}
                  />
                  <span>Select all outlets</span>
                </label>
                <div className={styles.dashboardStatsOutletList}>
                  {outlets.length === 0 ? (
                    <span className={styles.dashboardStatHint}>No outlets</span>
                  ) : (
                    sortedOutlets.map((outlet) => (
                      <label key={outlet.id} className={styles.dashboardStatsOutletRow}>
                        <input
                          type="checkbox"
                          checked={selectedSalesOutletIds.includes(outlet.id)}
                          onChange={() => toggleSalesOutlet(outlet.id)}
                        />
                        <span>{outlet.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <input
                type="date"
                className={styles.fieldInput}
                value={salesFrom}
                onChange={(event) => setSalesFrom(event.target.value)}
                aria-label="Sales from date"
              />
              <input
                type="date"
                className={styles.fieldInput}
                value={salesTo}
                onChange={(event) => setSalesTo(event.target.value)}
                aria-label="Sales to date"
              />
            </div>
            <p className={styles.dashboardStatValue}>
              {statsLoading ? "…" : selectedSalesOutletIds.length === 0 ? "—" : formatQty(stats?.sales.total_qty ?? 0)}
            </p>
            <p className={styles.dashboardStatMeta}>
              {selectedSalesOutletIds.length === 0
                ? "Select at least one outlet"
                : `Revenue ${statsLoading ? "…" : formatMoney(stats?.sales.total_revenue ?? 0)} · ${selectedSalesOutletIds.length} outlet${selectedSalesOutletIds.length === 1 ? "" : "s"}`}
            </p>
          </StatCard>

          <StatCard tone="green" label="Most sold product">
            <p className={styles.dashboardStatProduct} title={stats?.sales.most_sold?.name ?? undefined}>
              {statsLoading ? "…" : productLine(stats?.sales.most_sold ?? null)}
            </p>
            <p className={styles.dashboardStatHint}>
              Selected outlets · {salesFrom} to {salesTo}
            </p>
          </StatCard>

          <StatCard tone="green" label="Least sold product">
            <p className={styles.dashboardStatProduct} title={stats?.sales.least_sold?.name ?? undefined}>
              {statsLoading ? "…" : productLine(stats?.sales.least_sold ?? null)}
            </p>
            <p className={styles.dashboardStatHint}>
              Selected outlets · {salesFrom} to {salesTo}
            </p>
          </StatCard>

          <StatCard tone="blue" label="Outlet sales leaders">
            <div className={styles.dashboardStatsFilters}>
              <select
                className={styles.fieldSelect}
                value={outletLeaderId}
                onChange={(event) => setOutletLeaderId(event.target.value)}
                aria-label="Outlet for sales leaders"
              >
                <option value="">Select outlet</option>
                {sortedOutlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>
            </div>
            {!outletLeaderId ? (
              <p className={styles.dashboardStatHint}>Choose an outlet to view top and bottom sellers.</p>
            ) : (
              <>
                <p className={styles.dashboardStatSubLabel}>Most sold</p>
                <p
                  className={styles.dashboardStatProduct}
                  title={outletLeaderStats?.most_sold?.name ?? undefined}
                >
                  {outletLeaderLoading ? "…" : productLine(outletLeaderStats?.most_sold ?? null)}
                </p>
                <p className={styles.dashboardStatSubLabel}>Least sold</p>
                <p
                  className={styles.dashboardStatProduct}
                  title={outletLeaderStats?.least_sold?.name ?? undefined}
                >
                  {outletLeaderLoading ? "…" : productLine(outletLeaderStats?.least_sold ?? null)}
                </p>
                <p className={styles.dashboardStatHint}>
                  {selectedLeaderOutlet?.name ?? "Outlet"} · {salesFrom} to {salesTo}
                </p>
              </>
            )}
          </StatCard>
        </StatsSection>

        <StatsSection title="Purchases" tone="gold">
          <StatCard tone="gold" label="Purchases">
            <div className={styles.dashboardStatsFilters}>
              <input
                type="date"
                className={styles.fieldInput}
                value={purchasesFrom}
                onChange={(event) => setPurchasesFrom(event.target.value)}
                aria-label="Purchases from date"
              />
              <input
                type="date"
                className={styles.fieldInput}
                value={purchasesTo}
                onChange={(event) => setPurchasesTo(event.target.value)}
                aria-label="Purchases to date"
              />
            </div>
            <p className={styles.dashboardStatValue}>{statsLoading ? "…" : formatQty(stats?.purchases.total_qty ?? 0)}</p>
            <p className={styles.dashboardStatMeta}>
              Cost {statsLoading ? "…" : formatMoney(stats?.purchases.total_cost ?? 0)}
            </p>
          </StatCard>

          <StatCard tone="gold" label="Most purchased product">
            <p className={styles.dashboardStatProduct} title={stats?.purchases.most_purchased?.name ?? undefined}>
              {statsLoading ? "…" : productLine(stats?.purchases.most_purchased ?? null)}
            </p>
            <p className={styles.dashboardStatHint}>
              {purchasesFrom} to {purchasesTo}
            </p>
          </StatCard>

          <StatCard tone="gold" label="Least purchased product">
            <p className={styles.dashboardStatProduct} title={stats?.purchases.least_purchased?.name ?? undefined}>
              {statsLoading ? "…" : productLine(stats?.purchases.least_purchased ?? null)}
            </p>
            <p className={styles.dashboardStatHint}>
              {purchasesFrom} to {purchasesTo}
            </p>
          </StatCard>
        </StatsSection>

        <StatsSection title="Outlet orders" tone="red">
          <StatCard tone="green" label="Most ordered product">
            <p className={styles.dashboardStatProduct} title={stats?.outlet_orders.most_ordered?.name ?? undefined}>
              {statsLoading ? "…" : productLine(stats?.outlet_orders.most_ordered ?? null)}
            </p>
            <p className={styles.dashboardStatHint}>
              Outlet ordering app · {salesFrom} to {salesTo}
            </p>
          </StatCard>

          <StatCard tone="red" label="Least ordered product">
            <p className={styles.dashboardStatProduct} title={stats?.outlet_orders.least_ordered?.name ?? undefined}>
              {statsLoading ? "…" : productLine(stats?.outlet_orders.least_ordered ?? null)}
            </p>
            <p className={styles.dashboardStatHint}>
              Outlet ordering app · {salesFrom} to {salesTo}
            </p>
          </StatCard>
        </StatsSection>
      </div>
    </section>
  );
}
