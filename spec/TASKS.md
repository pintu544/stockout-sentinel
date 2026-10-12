# TASKS — Stockout Sentinel

> Ordered checklist. Each task ≤ half a day. "Done means" is the acceptance gate.

## Slice 1 — Data foundation (nothing to see yet, everything to stand on)
- [ ] **T1.1** Fixture contract + schema — `fixtures/schema.sql`, `fixtures/seed.sql`, `fixtures/CONTRACT.md` (reference date, 60 stable SKUs, idempotent refresh). *Done means: `psql -f` twice in a row yields identical row counts; 3 canary SKUs documented with hand-computed stockout dates.*
- [ ] **T1.2** Local Postgres + seed script — `npm run db:seed` works against local Postgres. *Done means: dashboard query returns 60 SKUs, canary values match CONTRACT.md.*
- [ ] **T1.3** InfiniSynapse data source connected + enabled — Postgres registered via API, `ai_database/list` shows it, enabled. *Done means: CLI/API `db ls` shows the source with enabled=1 (screenshot or JSON in the task log).*
- [ ] **T1.4** Render Postgres + seed — prod DB created, seeded, connection string stored. *Done means: same row counts as local; seed script parameterized by DATABASE_URL.*

## Slice 2 — The analysis loop (the demo)
- [ ] **T2.1** Next.js scaffold — App Router + TS + Tailwind, `/api/health` returning postgres/infini/quota status. *Done means: `npm run build` passes; /api/health returns 200 with real checks.*
- [ ] **T2.2** Dashboard (FR1) — inventory health cards + low-cover table from Postgres. *Done means: renders the 60-SKU fixture; numbers match direct SQL.*
- [ ] **T2.3** Analysis dispatch + SSE relay — `POST /api/analysis` creates the InfiniSynapse task; `GET /api/analysis/stream` relays progress to the browser. *Done means: clicking "Run analysis" shows live agent progress in the UI; refresh mid-run reconnects without duplicating the task.*
- [ ] **T2.4** Result rendering (FR4, FR5, FR6, FR7) — ranked reorder list + coverage chart from workspace artifacts + synthetic/AI labels. *Done means: canary SKUs appear with correct stockout dates; every row links to its SKU data.*
- [ ] **T2.5** Export CSV (FR8) + empty/error states (FR9, FR10) — *Done means: CSV downloads with the right columns; "all clear" and service-down states each render as designed.*

## Slice 3 — Demo readiness
- [ ] **T3.1** Failure-mode hardening — quota check, timeout/retry, invalid-key banner (GRILL Q7). *Done means: each failure simulated once and the UI behaves per spec.*
- [ ] **T3.2** Adversarial QA (fresh subagent) on the full slice — *Done means: all criticals fixed, warnings triaged.*
- [ ] **T3.3** Deploy + README — Vercel deploy, env vars set, README with demo script and architecture. *Done means: public URL runs the full demo end-to-end in < 2 min.*
- [ ] **T3.4** GitHub repo + submission prep — repo `pintu544/stockout-sentinel`, submitted when the organizer opens submissions. *Done means: repo public with spec/ included; submission checklist ready.*

## Dependency order
T1.1 → T1.2 → T1.3 → T1.4 → T2.1 → T2.2 → T2.3 → T2.4 → T2.5 → T3.1 → T3.2 → T3.3 → T3.4
(T1.3 needs the API key — already verified working.)
