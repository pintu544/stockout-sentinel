import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/dashboard";

/** GET /api/dashboard -> { ref_date, total_skus, at_risk_count, revenue_at_risk, low_cover[] } */
export async function GET() {
  try {
    return NextResponse.json(await getDashboard());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "dashboard failed" },
      { status: 500 }
    );
  }
}
