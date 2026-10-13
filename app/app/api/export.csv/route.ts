import { mockResult, realResult } from "@/lib/analysis";

const isMock = () => process.env.MOCK_ANALYSIS !== "false";

function csvCell(v: string | number): string {
  let s = String(v);
  // Formula injection guard: agent-controlled text starting with = + - @
  // becomes a live formula in Excel — neutralize with a leading quote.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/export.csv?taskId= -> text/csv download of the reorder list.
 * Columns: rank, sku_id, name, days_of_cover, stockout_date,
 *          revenue_at_risk, suggested_qty, reason, source
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  if (!taskId) {
    return new Response("taskId required", { status: 400 });
  }
  try {
    const result =
      isMock() || taskId.startsWith("mock-") ? await mockResult() : await realResult(taskId);
    if (!result) {
      return new Response("no result available for this task yet", { status: 404 });
    }
    const header = [
      "rank", "sku_id", "name", "days_of_cover", "stockout_date",
      "revenue_at_risk", "suggested_qty", "reason", "source",
    ];
    const lines = result.items.map((it, i) =>
      [
        i + 1, it.sku_id, it.name, it.days_of_cover, it.stockout_date,
        it.revenue_at_risk.toFixed(2), it.suggested_qty, it.reason, result.source,
      ]
        .map(csvCell)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n") + "\n";
    // ref_date comes from the agent — sanitize before header construction.
    const safeDate = (result.ref_date || "result").replace(/[^0-9a-z-]/gi, "");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stockout-sentinel-reorder-${safeDate}.csv"`,
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "export failed", { status: 500 });
  }
}
