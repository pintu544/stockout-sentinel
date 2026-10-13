import { NextResponse } from "next/server";
import { getDashboardResilient } from "@/lib/dashboard";

/**
 * GET /api/dashboard -> { ref_date, total_skus, at_risk_count, revenue_at_risk,
 *                         low_cover[], cached, cachedAt }
 * Resilient like the page: serves the last-good snapshot when Postgres is down.
 */
export async function GET() {
  try {
    const outcome = await getDashboardResilient();
    return NextResponse.json({
      ...outcome.data,
      cached: outcome.cached,
      cachedAt: outcome.cachedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "dashboard failed" },
      { status: 500 }
    );
  }
}
