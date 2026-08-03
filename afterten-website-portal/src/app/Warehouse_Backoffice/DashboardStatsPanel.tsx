"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DASHBOARD_PERIOD_LABELS,
  dashboardPeriodRange,
  type DashboardPeriod,
} from "@/lib/dashboardPeriod";
import {
  type MiddlewareScheduleRow,
  formatCountdown,
  formatStamp,
  MIDDLEWARE_POLL_MS,
} from "./middlewareMonitorShared";
import styles from "./enterprise.module.css";

type ProductStat = { name: string; qty: number } | null;

type DashboardStats = {
  sales: { most_sold: ProductStat; least_sold: ProductStat };
  outlet_orders: { most_ordered: ProductStat; least_ordered: ProductStat };
};

type ProductMetric = "most_sold" | "least_sold" | "most_ordered" | "least_ordered";

type CardVariant = "primary" | "sky" | "indigo" | "slate";

const CARD_VARIANT: Record<CardVariant, string> = {
  primary: styles.dashboardCardPrimary,
  sky: styles.dashboardCardSky,
  indigo: styles.dashboardCardIndigo,
  slate: styles.dashboardCardSlate,
};

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

function productLine(stat: ProductStat): string {
  if (!stat) return "No data yet";
  return `${stat.name} · ${formatQty(stat.qty)}`;
}

function pickMetric(stats: DashboardStats, metric: ProductMetric): ProductStat {
  switch (metric) {
    case "most_sold":
      return stats.sales.most_sold;
    case "least_sold":
      return stats.sales.least_sold;
    case "most_ordered":
      return stats.outlet_orders.most_ordered;
    case "least_ordered":
      return stats.outlet_orders.least_ordered;
  }
}

function PeriodTabs({
  period,
  onChange,
}: {
  period: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}) {
  return (
    <div className={styles.dashboardPeriodTabs} role="tablist" aria-label="Time period">
      {(["week", "month", "year"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={period === value}
          className={`${styles.dashboardPeriodTab} ${period === value ? styles.dashboardPeriodTabActive : ""}`}
          onClick={() => onChange(value)}
        >
          {DASHBOARD_PERIOD_LABELS[value]}
        </button>
      ))}
    </div>
  );
}

function ProductMetricCard({
  title,
  subtitle,
  metric,
  variant,
}: {
  title: string;
  subtitle: string;
  metric: ProductMetric;
  variant: CardVariant;
}) {
  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const [stat, setStat] = useState<ProductStat>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = dashboardPeriodRange(period);

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          sales_from: from,
          sales_to: to,
          orders_from: from,
          orders_to: to,
        });
        const res = await fetch(`/api/dashboard/stats?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error(json.error || "Unable to load stats");
        setStat(pickMetric(json as DashboardStats, metric));
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setStat(null);
        setError(err instanceof Error ? err.message : "Unable to load stats");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [period, metric]);

  const range = dashboardPeriodRange(period);

  return (
    <article className={`${styles.dashboardCard} ${CARD_VARIANT[variant]}`}>
      <div className={styles.dashboardCardHeader}>
        <div>
          <h3 className={styles.dashboardCardTitle}>{title}</h3>
          <p className={styles.dashboardCardSubtitle}>{subtitle}</p>
        </div>
      </div>
      <PeriodTabs period={period} onChange={setPeriod} />
      <p className={styles.dashboardCardValue} title={stat?.name ?? undefined}>
        {loading ? "…" : error ? "—" : productLine(stat)}
      </p>
      <p className={styles.dashboardCardMeta}>
        All outlets · {DASHBOARD_PERIOD_LABELS[period].toLowerCase()} · {range.from} to {range.to}
      </p>
      {error ? <p className={styles.dashboardCardError}>{error}</p> : null}
    </article>
  );
}

function ScheduleCard({ children }: { children: ReactNode }) {
  return (
    <article className={`${styles.dashboardCard} ${styles.dashboardCardSchedule}`}>{children}</article>
  );
}

export default function DashboardStatsPanel() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [schedule, setSchedule] = useState<MiddlewareScheduleRow | null>(null);

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

  const countdown = formatCountdown(schedule?.scheduled_at ?? null, nowMs);

  return (
    <section className={styles.dashboardShell}>
      <header className={styles.dashboardHeader}>
        <h2 className={styles.dashboardHeading}>Overview</h2>
        <p className={styles.dashboardLead}>
          Product performance across every outlet — POS sales and ordering app activity.
        </p>
      </header>

      <div className={styles.dashboardGrid}>
        <ProductMetricCard
          title="Most sold product"
          subtitle="POS sales · highest quantity"
          metric="most_sold"
          variant="primary"
        />
        <ProductMetricCard
          title="Least sold product"
          subtitle="POS sales · lowest quantity"
          metric="least_sold"
          variant="sky"
        />
        <ProductMetricCard
          title="Most ordered product"
          subtitle="Ordering app · highest quantity"
          metric="most_ordered"
          variant="indigo"
        />
        <ProductMetricCard
          title="Least ordered product"
          subtitle="Ordering app · lowest quantity"
          metric="least_ordered"
          variant="slate"
        />
        <ScheduleCard>
          <h3 className={styles.dashboardCardTitle}>Scheduled release</h3>
          <p className={styles.dashboardCardSubtitle}>Middleware catalog push</p>
          <p className={styles.dashboardScheduleCountdown}>{countdown}</p>
          <p className={styles.dashboardCardMeta}>
            {schedule?.scheduled_at ? formatStamp(schedule.scheduled_at) : "No schedule set"}
          </p>
        </ScheduleCard>
      </div>
    </section>
  );
}
