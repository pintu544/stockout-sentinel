# Fixture Contract — Stockout Sentinel demo data

> **This dataset is synthetic.** Generated deterministically; no real store, supplier, or sales data.

## Generation
- Generator: `fixtures/seed.py` (PRNG seed `20261012`). Regenerate with `python3 fixtures/seed.py`.
- Output: `fixtures/seed.sql` (committed, versioned — the generator and its output are both in the repo).
- Reference date ("today"): **2026-10-12**. Sales history: 84 days back (2026-07-20 → 2026-10-11).

## Contents
- 8 suppliers (`SUP-01`…`SUP-08`), lead times 2–14 days, min orders 24–240 units.
- 60 SKUs (`SKU-001`…`SKU-060`) across 6 categories: Beverages, Snacks, Dairy, Household, Personal Care, Frozen.
- `sales_daily`: one row per SKU per day (5,040 rows). Pattern = base velocity × weekend uplift × slight upward trend × ±20% noise; 3 SKUs have a 2.5× promo spike on days 60–73.
- `inventory`: one row per SKU, `updated_at = 2026-10-12`.

## Refresh semantics (idempotent)
- `seed.sql` begins with `TRUNCATE sales_daily, inventory, skus, suppliers;` then re-inserts everything.
- Re-running the seed **never duplicates** rows and **never merges** — it replaces the fixture set wholesale.
- User-created rows (none expected in the demo) would be wiped: do not mix fixture and user data in these tables.

## Canary SKUs (hand-verified, constant daily sales — no noise)
| SKU | Name | Daily units | On-hand | Days of cover (avg 28d) | Projected stockout |
|-----|------|-------------|---------|------------------------|--------------------|
| SKU-001 | Canary Cola 500ml | 10 | 100 | 10.0 | 2026-10-22 |
| SKU-002 | Canary Chips 150g | 5 | 50 | 10.0 | 2026-10-22 |
| SKU-003 | Canary Milk 1L | 25 | 200 | 8.0 | 2026-10-20 |

Verify with:
```sql
SELECT s.sku_id,
       ROUND(i.on_hand_units / NULLIF(AVG(d.units_sold),0), 1) AS days_cover
FROM skus s
JOIN inventory i ON i.sku_id = s.sku_id
JOIN sales_daily d ON d.sku_id = s.sku_id
WHERE s.is_canary AND d.sale_date >= DATE '2026-10-12' - INTERVAL '28 days'
GROUP BY s.sku_id, i.on_hand_units;
-- Expected: SKU-001 10.0, SKU-002 10.0, SKU-003 8.0
```
(Note: `CURRENT_DATE` in the query is illustrative — the fixture reference date is 2026-10-12; substitute as needed.)

## At-risk spread
~10 of the 60 SKUs are seeded with < 14 days of cover (the "at-risk" set the demo analysis should surface); the rest sit at 15–60 days. Exact at-risk count is printed by the generator — the demo does not hard-code it.
