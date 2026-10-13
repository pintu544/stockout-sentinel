import { NextResponse } from "next/server";
import { dispatchAnalysis } from "@/lib/analysis";

/** POST /api/analysis -> { taskId, connId, mock } — dispatches one analysis task. */
export async function POST() {
  try {
    const r = await dispatchAnalysis();
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "dispatch failed" },
      { status: 500 }
    );
  }
}
