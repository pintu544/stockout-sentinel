/**
 * Shared inventory-health metrics. The dashboard (FR1) and the InfiniSynapse
 * agent prompt (T2.3) use these exact definitions so the numbers agree.
 *
 * Reference date: the fixture's "today", 2026-10-12 (CONTRACT.md). Sales rows
 * cover the 84 complete days before it (2026-07-20..2026-10-11); the ref date
 * itself has no sales rows. Anchoring on the fixture date (not wall-clock or
 * MAX(sale_date)) keeps the demo deterministic and matches the CONTRACT's
 * hand-verified canary expectations exactly.
 *
 * - avg_daily(sku)      = SUM(units_sold over trailing 28d) / 28
 *                         where trailing 28d = [REF_DATE - 28d, REF_DATE)
 * - days_of_cover(sku)  = on_hand_units / avg_daily   (999 when avg_daily = 0)
 * - at-risk             = days_of_cover < 14
 * - revenue_at_risk(sku)= avg_daily * unit_price * max(0, 14 - days_of_cover)
 *     (est. lost-sales value over the next 14 days if not reordered)
 * - stockout_date(sku)  = REF_DATE + floor(days_of_cover) days
 */

export const REF_DATE = "2026-10-12";

export interface LowCoverRow {
  sku_id: string;
  name: string;
  category: string;
  on_hand_units: number;
  avg_daily: number;
  days_of_cover: number;
  stockout_date: string; // YYYY-MM-DD
  revenue_at_risk: number;
  is_canary: boolean;
}

export interface DashboardData {
  ref_date: string;
  total_skus: number;
  at_risk_count: number;
  revenue_at_risk: number;
  low_cover: LowCoverRow[];
}

export const RISK_THRESHOLD_DAYS = 14;
export const COVER_WINDOW_DAYS = 28;

/** One SQL query returning every row the dashboard needs. */
export const DASHBOARD_SQL = `
WITH ref AS (
  SELECT DATE '${REF_DATE}' AS ref_date
),
avg28 AS (
  SELECT s.sku_id, SUM(s.units_sold)::float / ${COVER_WINDOW_DAYS} AS avg_daily
  FROM sales_daily s, ref
  WHERE s.sale_date >= ref.ref_date - INTERVAL '${COVER_WINDOW_DAYS} days'
    AND s.sale_date < ref.ref_date
  GROUP BY s.sku_id
),
cover AS (
  SELECT
    k.sku_id, k.name, k.category, k.unit_price, k.is_canary,
    i.on_hand_units,
    COALESCE(a.avg_daily, 0) AS avg_daily,
    CASE WHEN COALESCE(a.avg_daily, 0) = 0 THEN 999
         ELSE i.on_hand_units / a.avg_daily END AS days_of_cover,
    (SELECT ref_date FROM ref) AS ref_date
  FROM skus k
  JOIN inventory i ON i.sku_id = k.sku_id
  LEFT JOIN avg28 a ON a.sku_id = k.sku_id
)
SELECT
  sku_id, name, category, on_hand_units,
  ROUND(avg_daily::numeric, 2)::float AS avg_daily,
  ROUND(days_of_cover::numeric, 2)::float AS days_of_cover,
  (ref_date + FLOOR(days_of_cover)::int)::text AS stockout_date,
  ROUND((avg_daily * unit_price * GREATEST(0, ${RISK_THRESHOLD_DAYS} - days_of_cover))::numeric, 2)::float AS revenue_at_risk,
  is_canary,
  ref_date::text
FROM cover
ORDER BY days_of_cover ASC;
`;
