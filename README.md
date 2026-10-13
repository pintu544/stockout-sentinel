# Stockout Sentinel

AI replenishment desk for retail: a Postgres inventory database analyzed by an
InfiniSynapse agent into a ranked reorder list — what will stock out, when,
how much revenue is at risk, and what to order.

**Live demo:** https://stockout-sentinel.vercel.app
**Hackathon:** InfiniSynapse Vibe Coding Hackathon 2026 — Retail & Replenishment track

> Demo data is fully synthetic (60 SKUs, 12 weeks of sales) with a documented
> fixture contract in `fixtures/CONTRACT.md`. Nothing here is real inventory.

## Demo script (< 2 min)

1. Open the live URL. The dashboard shows inventory health from Postgres:
   **60 SKUs tracked, 15 at risk (< 14 days of cover), ~$3,196 revenue at risk**,
   plus a canary check (3 hand-verified SKUs that must read 10.0 / 10.0 / 8.0 days).
2. Click **Run analysis**. The Next.js backend dispatches one task to the
   InfiniSynapse agent and relays its live progress over SSE — watch it scan
   SKUs, compute cover, and rank by revenue at risk.
3. When it finishes: a days-of-cover chart, the ranked reorder list with
   suggested quantities (rounded to supplier minimums), one-sentence reasons,
   and an **Export CSV** download.
4. Every section is labeled with its data source (AI analysis / mock / synthetic
   demo data), and the reorder table carries a *review-before-ordering* notice —
   recommendations, not purchase orders.

## Architecture

```
Browser (Next.js 16 App Router, React 19, Tailwind)
  │  HTTPS
  ▼
Next.js Route Handlers (BFF — the API key never leaves the server)
  │  ├─ Postgres (Render) — dashboard reads, fixture data
  │  └─ InfiniSynapse Server API — analysis tasks + SSE progress relay
  ▼
InfiniSynapse agent → queries the stockout_sentinel_pg data source → JSON result
```

- **The agent does the math, not us.** Our SQL only serves the dashboard; the
  agent's analysis is the product (that's what the hackathon judges).
- **Shared metric definitions** (`app/lib/metrics.ts`) pin the exact formulas so
  the dashboard and the agent agree: 28-day trailing average, days of cover,
  14-day risk threshold, revenue-at-risk, stockout dates.
- **Structured JSON contract** in the agent prompt; the BFF validates, coerces,
  sorts, and falls back to the raw transcript if parsing fails.
- **Failure modes** (per spec): health pills + invalid-key banner, busy-server
  503s, 120s watchdog with one-click retry, stream auto-reconnect, cached
  dashboard snapshot when Postgres is down.

## Project structure

```
spec/            GRILL.md, SPEC.md, DESIGN.md, TASKS.md (spec-driven build)
fixtures/        schema.sql, seed.sql, seed.py, CONTRACT.md
scripts/         render-seed/ — one-off Render seeder (deleted after use)
app/             Next.js app
  app/           page.tsx (dashboard), api/* (health, dashboard, analysis, export)
  lib/           db.ts, infini.ts, metrics.ts, prompts.ts, analysis.ts, dashboard.ts
  app/components/AnalysisPanel.tsx
```

## Run it locally

```bash
cd app
cp .env.local.example .env.local   # fill in DATABASE_URL + INFINISYNAPSE_API_KEY
npm install
npm run dev
```

Env vars:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Render external URL in prod) |
| `INFINISYNAPSE_API_KEY` | Server-only InfiniSynapse key |
| `INFINISYNAPSE_BASE_URL` | `https://app.infinisynapse.com` |
| `MOCK_ANALYSIS` | `true` = deterministic local mock (dev default, burns zero credits); `false` = real agent |

## Verification

- Fixture canaries: `SKU-001` 10.0d → stockout 2026-10-22, `SKU-002` 10.0d → 2026-10-22,
  `SKU-003` 8.0d → 2026-10-20 (see `fixtures/CONTRACT.md`).
- At-risk count is boundary-stable at 15 (adversarial QA, slice 1 + slice 3).
- `npm run build` clean; secret scans clean (no keys in repo or history).

## Notes

- InfiniSynapse exposes no quota/credits endpoint — `/api/health` reports
  `quota: "unknown"` honestly instead of inventing a number.
- The API key used for this demo appeared in a chat transcript during setup;
  rotate it after the hackathon.
