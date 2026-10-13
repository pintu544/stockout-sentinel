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
  /** Set when the transcript had no parseable result block (DESIGN fallback). */
  unparseable?: boolean;
  transcript?: string;
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

/** Coerce one raw item; return null when it's beyond repair (dropped, counted). */
function coerceItem(raw: unknown): AnalysisItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const sku_id = typeof r.sku_id === "string" ? r.sku_id : null;
  const name = typeof r.name === "string" ? r.name : sku_id;
  const days_of_cover = num(r.days_of_cover);
  const stockout_date = typeof r.stockout_date === "string" ? r.stockout_date : null;
  const revenue_at_risk = num(r.revenue_at_risk);
  const suggested_qty = num(r.suggested_qty);
  const reason = typeof r.reason === "string" ? r.reason : "";
  if (
    !sku_id || !name || days_of_cover === null || !stockout_date ||
    revenue_at_risk === null || suggested_qty === null
  ) {
    return null;
  }
  return {
    sku_id, name, days_of_cover, stockout_date, revenue_at_risk,
    suggested_qty: Math.round(suggested_qty), reason,
  };
}

function unparseableFallback(full: string): AnalysisResult {
  return {
    ref_date: "", items: [], source: "ai",
    unparseable: true, transcript: full.slice(0, 8000),
  };
}

/**
 * Extract the result from a task transcript.
 * - Takes the LAST fenced json block (agents often show an example first).
 * - Validates + coerces every item; drops unrepairable rows.
 * - Sorts by revenue_at_risk descending (rank = position).
 * - Falls back to the raw transcript when nothing parseable exists (DESIGN risk #1).
 */
export function parseResultBlock(messages: unknown[]): AnalysisResult | null {
  const texts: string[] = [];
  for (const m of messages as Array<{ text?: string; message?: { text?: string } }>) {
    if (typeof m?.text === "string") texts.push(m.text);
    if (typeof m?.message?.text === "string") texts.push(m.message.text);
  }
  const full = texts.join("\n");
  const blocks = [...full.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
  if (blocks.length === 0) {
    return full.trim() ? unparseableFallback(full) : null;
  }
  try {
    const parsed = JSON.parse(blocks[blocks.length - 1][1]) as {
      ref_date?: string;
      items?: unknown[];
    };
    if (!Array.isArray(parsed.items)) return unparseableFallback(full);
    const items = parsed.items
      .map(coerceItem)
      .filter((i): i is AnalysisItem => i !== null)
      .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk);
    if (items.length === 0) return unparseableFallback(full);
    return {
      ref_date: typeof parsed.ref_date === "string" ? parsed.ref_date : "",
      items,
      source: "ai",
    };
  } catch {
    return unparseableFallback(full);
  }
}

export async function realResult(taskId: string): Promise<AnalysisResult | null> {
  const messages = await getTaskMessages(taskId);
  return parseResultBlock(messages);
}
