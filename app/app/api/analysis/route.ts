import { NextResponse } from "next/server";
import { dispatchAnalysis } from "@/lib/analysis";

// Cheap per-IP dispatch throttle: the public demo URL has no auth (per spec),
// and every dispatch burns hackathon credits. 1 dispatch / 30s / IP is plenty
// for a human clicking "Run analysis", and stops naive spam.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 2;

function throttled(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

/** POST /api/analysis -> { taskId, connId, mock } — dispatches one analysis task. */
export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (throttled(ip)) {
      return NextResponse.json(
        { error: "Too many analysis requests — wait a minute and retry.", code: "THROTTLED" },
        { status: 429 }
      );
    }
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
