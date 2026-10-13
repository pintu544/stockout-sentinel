import { connection } from "next/server";
import { getDashboard } from "@/lib/dashboard";

export const metadata = { title: "Stockout Sentinel — Inventory Health" };

// DB-backed page: allow blocking dynamic render (cacheComponents-era
// replacement for force-dynamic).
export const instant = false;

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const ring =
    tone === "bad"
      ? "border-red-500/40"
      : tone === "warn"
        ? "border-amber-500/40"
        : tone === "ok"
          ? "border-emerald-500/40"
          : "border-zinc-800";
  return (
    <div className={`rounded-xl border ${ring} bg-zinc-900 p-5`}>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-zinc-50">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function coverTone(days: number) {
  if (days < 7) return "text-red-400";
  if (days < 14) return "text-amber-400";
  return "text-emerald-400";
}

export default async function DashboardPage() {
  await connection(); // DB-backed: always render on demand, never prerender
  const d = await getDashboard();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stockout Sentinel</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Replenishment desk · synthetic demo data · ref date {d.ref_date}
            </p>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="SKUs tracked" value={String(d.total_skus)} sub="60 synthetic SKUs" />
          <Card
            label="At risk (< 14d cover)"
            value={String(d.at_risk_count)}
            sub="needs reorder attention"
            tone={d.at_risk_count > 0 ? "bad" : "ok"}
          />
          <Card
            label="Revenue at risk"
            value={`$${d.revenue_at_risk.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="est. lost sales, 14-day window"
            tone={d.revenue_at_risk > 0 ? "warn" : "ok"}
          />
          <Card
            label="Canary check"
            value={d.low_cover.filter((r) => r.is_canary).length === 3 ? "3 / 3" : "MISMATCH"}
            sub="hand-verified SKUs in at-risk set"
            tone={d.low_cover.filter((r) => r.is_canary).length === 3 ? "ok" : "bad"}
          />
        </div>

        <h2 className="mt-10 text-lg font-semibold">Low-cover SKUs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">Avg / day</th>
                <th className="px-4 py-3 text-right">Days cover</th>
                <th className="px-4 py-3">Stockout</th>
                <th className="px-4 py-3 text-right">Rev. at risk</th>
              </tr>
            </thead>
            <tbody>
              {d.low_cover.map((r) => (
                <tr key={r.sku_id} className="border-t border-zinc-800/60 hover:bg-zinc-900/60">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {r.sku_id}
                    {r.is_canary && (
                      <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                        canary
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.on_hand_units}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.avg_daily}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${coverTone(r.days_of_cover)}`}>
                    {r.days_of_cover}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.stockout_date}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    ${r.revenue_at_risk.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-zinc-600">
          days_of_cover = on-hand ÷ avg daily sales (trailing 28d) · revenue at risk =
          avg daily × price × max(0, 14 − cover) · same formula the AI analysis uses.
        </p>
      </div>
    </main>
  );
}
