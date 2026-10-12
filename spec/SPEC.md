# SPEC — Stockout Sentinel

> InfiniSynapse Vibe Coding Hackathon 2026 · Track: Retail & Replenishment · 2026-10-12

## Problem
Small retail operators decide reorders by gut feel and spreadsheets. They stock out of winners (lost revenue) while overstocking slow movers (trapped cash), because sales velocity, on-hand inventory, and supplier lead times live in different places and nobody runs the math. A working app that turns those three inputs into a ranked "order this first" list is exactly the loop this track asks for.

## Users
- **Store manager / buyer** — runs the weekly analysis, acts on the reorder list.
- **Hackathon judge** — runs the demo in under 2 minutes, verifies the data path is real.

## Functional requirements
1. The system SHALL display an inventory health dashboard: SKU count, SKUs below 14 days of cover, total revenue-at-risk.
2. The system SHALL let the user start a replenishment analysis with one click ("Run analysis").
3. The system SHALL stream the agent's progress live (SSE) while the analysis runs.
4. The system SHALL present a ranked reorder list: SKU, projected stockout date, days of cover, revenue-at-risk, suggested order quantity, and the reason — each row traceable to underlying data.
5. The system SHALL render at least one visual artifact from the analysis (coverage chart or risk heatmap).
6. The system SHALL label the dataset as synthetic wherever it appears.
7. The system SHALL label AI output as AI-generated with a "review before ordering" notice.
8. The system SHALL let the user export the reorder list as CSV.
9. The system SHALL handle an empty result ("no SKUs at risk") as a first-class state.
10. The system SHALL degrade gracefully when the analysis service is unavailable (dashboard still renders; analysis button explains why it's disabled).

## Non-functional
- Dashboard first paint: p95 < 1.5s on Vercel free tier.
- Analysis dispatch → first streamed progress: < 5s.
- Full analysis completes: < 3 minutes for the 60-SKU fixture set.
- API key never leaves the server (verified: no key in client bundle — checked in QA).
- English only; mobile-responsive (no native app).

## Judging-criteria mapping
- **Scene value 40%** → FR1, FR4, FR8: a buyer can act on the output in a real weekly workflow.
- **Technical completeness 35%** → FR2, FR3, FR5, FR10: real Postgres → real InfiniSynapse agent → streamed UI, with failure handling.
- **Innovation 25%** → GRILL Q9/Q10: traceable AI reasoning + canary verification, not a black-box list.

## Out of scope
User accounts/auth, multi-store tenants, purchase-order placement, supplier APIs, mobile apps, non-English locales, Luma registration, final submission packaging (until the organizer publishes details).
