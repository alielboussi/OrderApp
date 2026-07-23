export type DashboardPeriod = "week" | "month" | "year";

const EAT = "Africa/Nairobi";

function eatYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EAT }).format(date);
}

function eatDateParts(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  return { year, month, day };
}

/** Calendar bounds in East Africa Time for dashboard product cards. */
export function dashboardPeriodRange(period: DashboardPeriod): { from: string; to: string } {
  const to = eatYmd(new Date());

  if (period === "week") {
    const anchor = eatDateParts(to);
    const fromDate = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day));
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    return { from: eatYmd(fromDate), to };
  }

  if (period === "month") {
    const { year, month } = eatDateParts(to);
    const monthText = String(month).padStart(2, "0");
    return { from: `${year}-${monthText}-01`, to };
  }

  const { year } = eatDateParts(to);
  return { from: `${year}-01-01`, to };
}

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
};
