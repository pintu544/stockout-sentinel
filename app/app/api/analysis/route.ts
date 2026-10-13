import { NextResponse } from "next/server";
import { dispatchAnalysis } from "@/lib/analysis";

/** POST /api/analysis -> { taskId, connId, mock } — dispatches one analysis task. */
export async function POST() {
  try {
    const r = await dispatchAnalysis();
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "dispatch failed";
    // InfiniSynapse reports overload as HTTP 500 "Server is busy" — surface it
    // as a distinct code so the UI can say "busy or credits exhausted" (GRILL Q7)
    // instead of a generic error.
    const busy = /500|busy/i.test(msg);
    return NextResponse.json(
      { error: msg, code: busy ? "UPSTREAM_BUSY" : "DISPATCH_FAILED" },
      { status: busy ? 503 : 500 }
    );
  }
}
