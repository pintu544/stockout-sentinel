# DESIGN — Stockout Sentinel

> 2026-10-12 · Follows SPEC.md.

## Architecture
```
Browser (Next.js App Router, React 19)
  │  HTTPS
  ▼
Next.js Route Handlers (BFF, server-only)
  │  ┌─ Postgres (Render) — dashboard reads, fixture data
  │  └─ InfiniSynapse Server API (SSE) — analysis tasks
  │        POST /api/ai/message  {type: newTask, ...}
  │        GET  /api/ai/events?connId=  (stream)
  ▼
InfiniSynapse Agent → queries Postgres data source → workspace artifacts
```

The browser never touches InfiniSynapse or Postgres directly. The BFF holds the API key, opens the SSE stream, and relays progress events to the client via its own SSE endpoint. The agent's final structured output (JSON in the task transcript) is parsed by the BFF into the reorder list; charts render from workspace artifact files.

## Data model (Postgres)
- **skus** — `sku_id` (PK, stable e.g. `SKU-001`), `name`, `category`, `unit_cost`, `unit_price`, `supplier_id`, `lead_time_days`
- **inventory** — `sku_id` (FK), `on_hand_units`, `updated_at`
- **sales_daily** — `sku_id` (FK), `sale_date`, `units_sold` (12 weeks back from the fixture reference date)
- **suppliers** — `supplier_id` (PK), `name`, `min_order_units`
- Derived (computed by the agent, not stored): `days_of_cover = on_hand / avg_daily_sales(28d)`, `stockout_date`, `revenue_at_risk`, `suggested_qty`

## API contracts (our BFF)
- `GET /api/health` → `{ ok, postgres: true|false, infini: true|false, quota }` — pre-flight for the UI.
- `POST /api/analysis` → `{ taskId, connId }` — creates the InfiniSynapse task (type `newTask`, prompt template from `lib/prompts.ts`), snapshots enabled data source.
- `GET /api/analysis/stream?connId=` → SSE relay of agent progress (`message.partial`, `state.ready`, `completion_result`).
- `GET /api/analysis/:taskId/result` → `{ items: [{sku_id, name, stockout_date, days_of_cover, revenue_at_risk, suggested_qty, reason}], artifacts: [...] }`
- `GET /api/dashboard` → `{ total_skus, at_risk_count, revenue_at_risk, low_cover: [...] }` — fast Postgres read for FR1.
- `GET /api/export.csv?taskId=` → CSV of the reorder list.

## Key decisions
- **Next.js BFF over separate backend:** one deploy, API key stays server-side, matches Pintu's stack. Rejected: standalone Express (extra deploy, no benefit).
- **InfiniSynapse does the math, not us:** the hackathon judges the InfiniSynapse integration; our SQL only serves the dashboard. The agent's analysis is the product.
- **Structured JSON contract in the prompt:** the task prompt instructs the agent to finish with a fenced JSON block in a fixed schema; BFF parses it, falls back to showing the raw transcript if parsing fails.
- **Render Postgres free tier:** zero cost, enough for 60 SKUs × 84 days. Rejected: Supabase (heavier than needed), local-only (judges need a live URL).
- **No auth:** single demo store; out of scope per GRILL.

## Risks
1. **Agent output format drifts** (JSON block malformed) → de-risked: strict prompt schema + BFF fallback renders raw transcript; canary SKUs (GRILL Q10) catch silent wrongness.
2. **SSE through Vercel serverless** (function timeouts on long streams) → de-risked: BFF relays with heartbeats; client auto-reconnects with same connId; task state is server-side in InfiniSynapse so nothing is lost.
3. **500-credit quota burn during dev** → de-risked: quota check in `/api/health`; dev against a mock BFF response until the real path is needed; each full analysis is one task, not many.
