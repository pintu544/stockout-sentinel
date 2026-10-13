"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { AnalysisItem, AnalysisResult } from "@/lib/analysis";

type Phase = "idle" | "running" | "done" | "error";

/** Catches render crashes from agent-shaped data so the whole panel doesn't die. */
class ResultsBoundary extends Component<{ children: ReactNode }, { crashed: boolean; what: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false, what: "" };
  }
  static getDerivedStateFromError(e: unknown) {
    return { crashed: true, what: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-950/30 p-6 text-center">
          <p className="text-sm font-semibold text-red-300">Couldn't render this result</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{this.state.what}</p>
          <p className="mt-2 text-sm text-zinc-400">The analysis data was malformed — try running it again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function SourceBadge({ source }: { source: AnalysisResult["source"] }) {
  const label = source === "ai" ? "AI analysis" : "Mock analysis";
  const cls =
    source === "ai"
      ? "bg-violet-500/15 text-violet-300"
      : "bg-zinc-500/15 text-zinc-400";
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>
      {label} · synthetic demo data
    </span>
  );
}

export default function AnalysisPanel({ aiAvailable }: { aiAvailable: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const settledRef = useRef(false);
  const [pendingReconnect, setPendingReconnect] = useState<{ taskId: string; connId: string } | null>(null);

  // GRILL Q7: task marked failed after 120s without completion.
  const WATCHDOG_MS = 120_000;
  const MAX_RECONNECTS = 3;
  const STORAGE_KEY = "stockout-sentinel:analysis";

  // T2.3 done-means: a refresh mid-run reconnects without dispatching a duplicate.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { taskId: string; connId: string; at: number };
        if (saved.taskId && saved.connId && Date.now() - saved.at < WATCHDOG_MS) {
          setTaskId(saved.taskId);
          setPendingReconnect({ taskId: saved.taskId, connId: saved.connId });
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch { /* ignore */ }
  }, []);

  function remember(task: string, conn: string) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ taskId: task, connId: conn, at: Date.now() }));
    } catch { /* ignore */ }
  }
  function forget() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  async function run() {
    setPhase("running");
    setLog([]);
    setResult(null);
    setError(null);
    setPendingReconnect(null);
    try {
      const res = await fetch("/api/analysis", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        if (body.code === "UPSTREAM_BUSY") {
          throw new Error(
            "The analysis service is busy or its credits are exhausted. Wait a few minutes and retry."
          );
        }
        if (body.code === "THROTTLED") {
          throw new Error(body.error ?? "Too many requests — wait a minute and retry.");
        }
        throw new Error(body.error ?? `dispatch failed (${res.status})`);
      }
      const task: string = body.taskId;
      const conn: string = body.connId;
      setTaskId(task);
      remember(task, conn);
      setLog((l) => [...l, body.mock ? "Dispatched mock analysis." : `Task ${task} created.`]);
      attach(task, conn);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "failed");
    }
  }

  /** Re-attach to an in-flight analysis after a page refresh (no duplicate dispatch). */
  function reconnect() {
    if (!pendingReconnect) return;
    const { taskId: task, connId: conn } = pendingReconnect;
    setPendingReconnect(null);
    setPhase("running");
    setLog([`Reconnecting to task ${task}…`]);
    setResult(null);
    setError(null);
    attach(task, conn);
  }

  function attach(task: string, conn: string) {
    let attempts = 0;
    settledRef.current = false;
    const settle = () => {
      settledRef.current = true;
      clearTimeout(deadline);
      forget();
    };
    const deadline = setTimeout(() => {
      if (!settledRef.current) {
        settle();
        esRef.current?.close();
        setPhase("error");
        setError("Analysis timed out after 120s. The service may be overloaded — retry with one click.");
      }
    }, WATCHDOG_MS);

    const connect = () => {
      if (settledRef.current) return;
      attempts += 1;
      const es = new EventSource(`/api/analysis/stream?connId=${encodeURIComponent(conn)}`);
      esRef.current = es;
      es.addEventListener("progress", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data);
          if (d.text) setLog((l) => [...l, d.text]);
        } catch { /* ignore */ }
      });
      const finish = async (ok: boolean, msg?: string) => {
        if (settledRef.current) return;
        es.close();
        if (!ok) {
          // Auto-reconnect with the same connId (task state lives server-side).
          if (attempts < MAX_RECONNECTS) {
            setLog((l) => [...l, `Stream dropped — reconnecting (${attempts}/${MAX_RECONNECTS})…`]);
            setTimeout(() => { if (!settledRef.current) connect(); }, 2000);
            return;
          }
          settle();
          setPhase("error");
          setError(msg ?? "stream failed");
          return;
        }
        settle();
        try {
          const r = await fetch(`/api/analysis/${encodeURIComponent(task)}/result`);
          const body = await r.json();
          if (!r.ok) throw new Error(body.error ?? "result not ready yet — try again in a few seconds");
          setResult(body);
          setPhase("done");
        } catch (e) {
          setPhase("error");
          setError(e instanceof Error ? e.message : "failed");
        }
      };
      es.addEventListener("done", () => finish(true));
      es.addEventListener("error", () => finish(false, "stream error"));
      es.onerror = () => finish(false, "stream error");
    };
    connect();
  }

  const maxCover = Math.max(14, ...((result?.items ?? []).map((i) => i.days_of_cover)));

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI reorder analysis</h2>
        {result && <SourceBadge source={result.source} />}
      </div>

      {phase === "idle" && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          {!aiAvailable ? (
            <>
              <p className="text-sm font-semibold text-amber-300">
                Analysis service unavailable — check API key
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                The inventory dashboard above is live from Postgres; AI analysis is
                disabled until the InfiniSynapse service is reachable.
              </p>
              <button
                disabled
                className="mt-4 cursor-not-allowed rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-500"
              >
                Run analysis
              </button>
            </>
          ) : pendingReconnect ? (
            <>
              <p className="text-sm text-zinc-400">
                An analysis was still running when the page reloaded.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={reconnect}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Reconnect to running analysis
                </button>
                <button
                  onClick={() => { setPendingReconnect(null); forget(); }}
                  className="rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  Discard
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Let the InfiniSynapse agent analyze demand, lead times and stock levels,
                then rank what to reorder.
              </p>
              <button
                onClick={run}
                className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Run analysis
              </button>
            </>
          )}
        </div>
      )}

      {phase === "running" && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-3">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
            <span className="text-sm text-zinc-300">Analysis running…</span>
          </div>
          <ul className="mt-4 space-y-1 font-mono text-xs text-zinc-500">
            {log.map((l, i) => (
              <li key={i}>› {l}</li>
            ))}
          </ul>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-950/30 p-6 text-center">
          <p className="text-sm text-red-300">Analysis failed: {error}</p>
          <button
            onClick={run}
            className="mt-4 rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Retry
          </button>
        </div>
      )}

      {phase === "done" && result && result.unparseable && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-6">
          <p className="text-sm font-semibold text-amber-300">
            The agent finished, but its result wasn't machine-readable
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Showing the raw transcript instead — the numbers below were not parsed into the reorder table.
          </p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-4 font-mono text-xs text-zinc-300">
            {result.transcript}
          </pre>
          <div className="mt-3 flex items-center justify-between">
            <SourceBadge source={result.source} />
            <button
              onClick={run}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Re-run
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && !result.unparseable && result.items.length === 0 && (
        <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-6 text-center">
          <p className="text-lg font-semibold text-emerald-300">All clear ✓</p>
          <p className="mt-1 text-sm text-zinc-400">
            No SKUs below 14 days of cover. Nothing to reorder right now.
          </p>
          <div className="mt-3 flex justify-center">
            <SourceBadge source={result.source} />
          </div>
        </div>
      )}

      {phase === "done" && result && !result.unparseable && result.items.length > 0 && (
        <ResultsBoundary>
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              {result.items.length} SKUs below 14 days of cover, ranked by revenue at risk.
            </p>
            <button
              onClick={run}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Re-run
            </button>
          </div>
          <p className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
            Review before ordering — these are AI-generated recommendations from synthetic
            demo data, not purchase orders. Verify quantities against your supplier terms.
          </p>

          {/* Coverage chart (CSS bars) */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="text-sm font-semibold text-zinc-300">Days of cover</h3>
            <div className="mt-3 space-y-1.5">
              {[...result.items]
                .sort((a, b) => a.days_of_cover - b.days_of_cover)
                .map((it: AnalysisItem) => (
                  <div key={it.sku_id} className="flex items-center gap-3 text-xs">
                    <span className="w-16 shrink-0 font-mono text-zinc-500">{it.sku_id}</span>
                    <div className="h-3 flex-1 rounded bg-zinc-800">
                      <div
                        className={`h-3 rounded ${it.days_of_cover < 7 ? "bg-red-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(100, (it.days_of_cover / maxCover) * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-400">
                      {it.days_of_cover}d
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Ranked reorder list */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Cover</th>
                  <th className="px-4 py-3">Stockout</th>
                  <th className="px-4 py-3 text-right">Rev. at risk</th>
                  <th className="px-4 py-3 text-right">Suggested qty</th>
                  <th className="px-4 py-3">Why</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it: AnalysisItem, i: number) => (
                  <tr key={it.sku_id} className="border-t border-zinc-800/60 hover:bg-zinc-900/60">
                    <td className="px-4 py-2.5 text-zinc-500">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <a href={`#sku-${it.sku_id}`} className="font-mono text-xs text-zinc-100 hover:text-emerald-300 hover:underline">
                        {it.sku_id}
                      </a>
                      <span className="ml-2 text-zinc-300">{it.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-400">
                      {it.days_of_cover}d
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{it.stockout_date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${it.revenue_at_risk.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-400">
                      {it.suggested_qty.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <SourceBadge source={result.source} />
            {taskId && (
              <a
                href={`/api/export.csv?taskId=${encodeURIComponent(taskId)}`}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                Export CSV
              </a>
            )}
          </div>
        </div>
        </ResultsBoundary>
      )}
    </section>
  );
}
