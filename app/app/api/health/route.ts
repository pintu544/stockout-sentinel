import { NextResponse } from "next/server";
import { dbPing } from "@/lib/db";
import { infiniPing } from "@/lib/infini";

/**
 * GET /api/health -> { ok, postgres, infini, quota }
 * Pre-flight for the UI. quota is "unknown": InfiniSynapse exposes no
 * quota/credits endpoint (all candidates 404 as of 2026-10-13), so we
 * report honestly instead of inventing a number.
 */
export async function GET() {
  const [postgres, infini] = await Promise.all([dbPing(), infiniPing()]);
  const ok = postgres && infini;
  return NextResponse.json({
    ok,
    postgres,
    infini,
    quota: "unknown" as const,
  });
}
