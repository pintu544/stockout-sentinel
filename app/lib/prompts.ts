import { REF_DATE } from "@/lib/metrics";

/**
 * The analysis prompt sent to the InfiniSynapse agent. It pins the exact
 * metric definitions from lib/metrics.ts so the agent's numbers agree with
 * the dashboard, and demands a fenced JSON block the BFF can parse.
 */
export function buildAnalysisPrompt(): string {
  return `You are a replenishment analyst for a retail store. Use the Postgres data source "stockout_sentinel_pg".

Tables:
- skus(sku_id, name, category, unit_cost, unit_price, supplier_id, is_canary)
- inventory(sku_id, on_hand_units, updated_at)
- sales_daily(sku_id, sale_date, units_sold)   -- 84 days of history ending 2026-10-11
- suppliers(supplier_id, name, lead_time_days, min_order_units)

Reference date ("today") is ${REF_DATE}.

Task: analyze all 60 SKUs and produce a ranked reorder list. For each SKU compute with SQL:
- avg_daily = SUM(units_sold over the 28 days [${REF_DATE} - 28 days, ${REF_DATE})) / 28
- days_of_cover = on_hand_units / avg_daily   (use 999 if avg_daily = 0)
- stockout_date = ${REF_DATE} + FLOOR(days_of_cover) days
- revenue_at_risk = avg_daily * unit_price * GREATEST(0, 14 - days_of_cover)
- suggested_qty = CEIL((30 - days_of_cover) * avg_daily / min_order_units) * min_order_units
  (0 when days_of_cover >= 30; join suppliers for min_order_units)
- reason = one plain sentence, e.g. "5.2 days of cover; ~$640 of sales at risk over 14 days"

Include every SKU with days_of_cover < 14, ranked by revenue_at_risk descending.
Note: this is a synthetic demo dataset, clearly labeled as such.

Finish your response with a fenced JSON block in EXACTLY this schema and nothing else after it:
\`\`\`json
{
  "ref_date": "${REF_DATE}",
  "items": [
    {"sku_id": "SKU-001", "name": "Canary Cola 500ml", "days_of_cover": 10.0,
     "stockout_date": "2026-10-22", "revenue_at_risk": 48.0,
     "suggested_qty": 200, "reason": "..."}
  ]
}
\`\`\`
Rules: every number must come from SQL you actually ran against the data source. Do not invent SKUs. Three canary SKUs (SKU-001/002/003, is_canary=true) have hand-verified covers of 10.0/10.0/8.0 days — if your SQL disagrees, your window is wrong; fix it.`;
}
