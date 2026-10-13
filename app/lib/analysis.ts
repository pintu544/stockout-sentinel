import { dbQuery } from "@/lib/db";
import { createAnalysisTask, getTaskMessages } from "@/lib/infini";
import { buildAnalysisPrompt } from "@/lib/prompts";
import { REF_DATE, RISK_THRESHOLD_DAYS } from "@/lib/metrics";

// Server-only analysis orchestration. MOCK_ANALYSIS=true (dev default) runs a
// deterministic local computation with the same schema the agent returns,
// so UI work never burns the 500-credit quota.

export interface AnalysisItem {
  sku_id: string;
  name: string;
  days_of_cover: number;
  stockout_date: string;
  revenue_at_risk: number;
  suggested_qty: number;
  reason: string;
}

export interface AnalysisResult {
  ref_date: string;
  items: AnalysisItem[];
  source: "mock" | "ai";
}

const isMock = () => process.env.MOCK_ANALYSIS !== "false";

export async function dispatchAnalysis(): Promise<{ taskId: string; connId: string; mock: boolean }> {
  if (isMock()) {
    return { taskId: `mock-${Date.now()}`, connId: crypto.randomUUID(), mock: true };
  }
  const { taskId, connId } = await createAnalysisTask(buildAnalysisPrompt());
  return { taskId, connId, mock: false };
}

/** Deterministic mock result: same formula as lib/metrics, + suggested_qty. */
export async function mockResult(): Promise<AnalysisResult> {
  const rows = await dbQuery<{
    sku_id: string;
    name: string;
    unit_price: number;
    on_hand_units: number;
    avg_daily: number;
    days_of_cover: number;
    stockout_date: string;
    revenue_at_risk: number;
    min_order_units: number;
  }>(`
    WITH avg28 AS (
      SELECT s.sku_id, SUM(s.units_sold)::float / 28 AS avg_daily
      FROM sales_daily s
      WHERE s.sale_date >= DATE '${REF_DATE}' - INTERVAL '28 days'
        AND s.sale_date < DATE '${REF_DATE}'
      GROUP BY s.sku_id
    )
    SELECT k.sku_id, k.name, k.unit_price, i.on_hand_units,
           COALESCE(a.avg_daily, 0) AS avg_daily,
           CASE WHEN COALESCE(a.avg_daily, 0) = 0 THEN 999
                ELSE i.on_hand_units / a.avg_daily END AS days_of_cover,
           (DATE '${REF_DATE}' + FLOOR(CASE WHEN COALESCE(a.avg_daily, 0) = 0 THEN 999
                ELSE i.on_hand_units / a.avg_daily END)::int)::text AS stockout_date,
           ROUND((COALESCE(a.avg_daily,0) * k.unit_price * GREATEST(0, 14 - CASE WHEN COALESCE(a.avg_daily,0)=0 THEN 999 ELSE i.on_hand_units / a.avg_daily END))::numeric, 2)::float AS revenue_at_risk,
           sup.min_order_units
    FROM skus k
    JOIN inventory i ON i.sku_id = k.sku_id
    JOIN suppliers sup ON sup.supplier_id = k.supplier_id
    LEFT JOIN avg28 a ON a.sku_id = k.sku_id
  `);
  const items: AnalysisItem[] = rows
    .filter((r) => r.days_of_cover < RISK_THRESHOLD_DAYS)
    .map((r) => {
      const need = Math.max(0, (30 - r.days_of_cover) * r.avg_daily);
      const suggested_qty =
        need <= 0 ? 0 : Math.ceil(need / r.min_order_units) * r.min_order_units;
      return {
        sku_id: r.sku_id,
        name: r.name,
        days_of_cover: Math.round(r.days_of_cover * 100) / 100,
        stockout_date: r.stockout_date,
        revenue_at_risk: r.revenue_at_risk,
        suggested_qty,
        reason: `${r.days_of_cover.toFixed(1)} days of cover; ~$${r.revenue_at_risk.toFixed(0)} of sales at risk over 14 days`,
      };
    })
    .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk);
  return { ref_date: REF_DATE, items, source: "mock" };
}

/** Extract the fenced JSON result block from a real task's transcript. */
export function parseResultBlock(messages: unknown[]): AnalysisResult | null {
  const texts: string[] = [];
  for (const m of messages as Array<{ text?: string; message?: { text?: string } }>) {
    if (typeof m?.text === "string") texts.push(m.text);
    if (typeof m?.message?.text === "string") texts.push(m.message.text);
  }
  const full = texts.join("\n");
  const match = full.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { ref_date: string; items: AnalysisItem[] };
    if (!Array.isArray(parsed.items)) return null;
    return { ref_date: parsed.ref_date, items: parsed.items, source: "ai" };
  } catch {
    return null;
  }
}

export async function realResult(taskId: string): Promise<AnalysisResult | null> {
  const messages = await getTaskMessages(taskId);
  return parseResultBlock(messages);
}
