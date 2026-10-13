import { NextResponse } from "next/server";
import { mockResult, realResult } from "@/lib/analysis";

const isMock = () => process.env.MOCK_ANALYSIS !== "false";

/**
 * GET /api/analysis/:taskId/result -> { ref_date, items[], source }
 * Mock mode recomputes deterministically; real mode parses the task transcript.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const result = isMock() ? await mockResult() : await realResult(taskId);
    if (!result) {
      // Empty transcript: the analysis is genuinely still running.
      return NextResponse.json(
        { error: "no transcript yet — the analysis may still be running" },
        { status: 404 }
      );
    }
    // result may carry unparseable:true + transcript (DESIGN fallback) —
    // the client renders the raw transcript instead of dying.
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "result failed" },
      { status: 500 }
    );
  }
}
