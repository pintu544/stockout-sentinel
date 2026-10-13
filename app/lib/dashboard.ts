import { dbQuery } from "@/lib/db";
import {
  DASHBOARD_SQL,
  RISK_THRESHOLD_DAYS,
  type DashboardData,
  type LowCoverRow,
} from "@/lib/metrics";

// Server-only. Single source of truth for FR1; the route handler wraps this.

interface Row {
  sku_id: string;
  name: string;
  category: string;
  on_hand_units: number;
  avg_daily: number;
  days_of_cover: number;
  stockout_date: string;
  revenue_at_risk: number;
  is_canary: boolean;
  ref_date: string;
}

export async function getDashboard(): Promise<DashboardData> {
  const rows = await dbQuery<Row>(DASHBOARD_SQL);
  const low_cover: LowCoverRow[] = rows
    .filter((r) => r.days_of_cover < RISK_THRESHOLD_DAYS)
    .map(({ ref_date: _ref, ...rest }) => rest);
  return {
    ref_date: rows[0]?.ref_date ?? "",
    total_skus: rows.length,
    at_risk_count: low_cover.length,
    revenue_at_risk: Math.round(
      low_cover.reduce((s, r) => s + r.revenue_at_risk, 0) * 100
    ) / 100,
    low_cover,
  };
}
