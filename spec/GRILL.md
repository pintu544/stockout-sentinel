# GRILL — Stockout Sentinel

> Pre-build interrogation for the InfiniSynapse Vibe Coding Hackathon 2026 entry.
> Track: **Retail & Replenishment**. Answers locked 2026-10-12.

## Q1 — Completion evidence
The ONE demo: Pintu opens the app, clicks **"Run replenishment analysis"**, watches the InfiniSynapse agent's progress stream in, and gets a ranked reorder list — each SKU with stockout date, revenue-at-risk, suggested order quantity, and the data-backed reason. A reviewer can run the same flow in under 2 minutes with zero setup beyond the deployed URL.

## Q2 — Stack and layout
- **App:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 — single repo `~/workspace/stockout-sentinel/`.
- **Data:** PostgreSQL (Render free tier for the demo; local Postgres for dev).
- **Analysis engine:** InfiniSynapse Server API via SSE — the app is a thin BFF; the agent does the analysis.
- **Why:** matches Pintu's current stack, deploys free, and the hackathon requires InfiniSynapse as the data engine.

## Q3 — Data and migration
- Synthetic retail dataset, **clearly labeled synthetic** (allowed by the rules): 60 SKUs, 12 weeks of daily sales, on-hand inventory, supplier lead times, unit costs/prices.
- Lives in `fixtures/` as versioned SQL with a documented contract: fixed reference date, stable SKU IDs, idempotent refresh (never duplicates, never overwrites user edits).
- InfiniSynapse connects to the same Postgres as a data source (registered + enabled via API before any task runs).
- No migration framework — single `schema.sql` + `seed.sql`; the dataset is read-mostly for the demo.

## Q4 — Ports and infra
- Local dev: Next.js on `:3000`, Postgres on `:5432`.
- Prod: Vercel (frontend) + Render Postgres. Both free tiers.
- Secrets: InfiniSynapse API key in server-side env only (`process.env` on Vercel / local `.env`, gitignored). Never in client bundles, never in the repo.

## Q5 — The happy path
Store manager opens the Replenishment Desk, sees current inventory health at a glance, clicks "Run analysis". The app opens an SSE stream to InfiniSynapse and dispatches a task ("analyze stockout risk for the next 14 days, rank by revenue at risk, suggest order quantities"). The agent explores the Postgres tables, computes days-of-cover per SKU against sales velocity and lead time, and returns a ranked list with reasons. The UI renders the list plus a coverage chart from the task's workspace artifacts. The manager exports the reorder list.

## Q6 — Boundary cases (MUST handle)
- Analysis in progress when the user navigates away / refreshes → reconnect shows task status, never starts a duplicate blindly.
- InfiniSynapse returns zero at-risk SKUs → show "all clear" state, not an empty screen.
- SSE disconnect mid-stream → auto-reconnect with the same connId; task continues server-side.
- Dataset refresh while a task is running → tasks snapshot the data source state at creation; no mid-run corruption.

## Q7 — Failure modes
- **API key invalid/expired (1101/1105):** banner "Analysis service unavailable — check API key", inventory dashboard still renders from Postgres.
- **InfiniSynapse timeout:** task marked failed after 120s; user can retry with one click.
- **Postgres unreachable:** dashboard shows cached last-good snapshot timestamp + error; analysis button disabled with reason.
- **Quota exhausted (500 hackathon credits):** pre-flight quota check; graceful "credits exhausted" message instead of a hung stream.

## Q8 — Out of scope
- User accounts, auth, multi-tenant stores. Single demo store.
- Real purchase orders / supplier integrations — the output is a *recommendation list*, not an order placement.
- Mobile app. Mobile-responsive web only.
- Luma registration (Pintu's step), final submission (details not published yet — handled when the organizer opens it).
- Hindi/other locales — English only.

## Q9 — How does the app stay honest about "AI did the analysis"?
Every recommendation shows its inputs (which tables/fields the agent used) and the agent's reasoning summary, rendered from the task transcript. The UI labels the list "AI-generated — review before ordering" and links each row to the underlying SKU data. No black-box numbers.

## Q10 — What if the agent's numbers are wrong in the demo?
The fixture contract includes 3 hand-verified "canary" SKUs with known-correct stockout dates computed offline. The demo script checks those three first. If the agent disagrees with a canary, we show the discrepancy rather than hiding it — judges reward verifiability over perfection.
