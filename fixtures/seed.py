#!/usr/bin/env python3
"""Deterministic fixture generator for Stockout Sentinel.

Generates fixtures/seed.sql with a fixed PRNG seed, so the dataset is
identical on every run. Run:  python3 fixtures/seed.py
Then apply:  psql $DATABASE_URL -f fixtures/schema.sql -f fixtures/seed.sql

Contract: see fixtures/CONTRACT.md
"""
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20261012
REF_DATE = date(2026, 10, 12)          # fixture reference date ("today")
SALES_DAYS = 84                        # 12 weeks of history
COVER_WINDOW = 28                      # days used for avg daily sales
RISK_THRESHOLD_DAYS = 14

rng = random.Random(SEED)

SUPPLIERS = [
    ("SUP-01", "FreshFarms Distributors", 3, 48),
    ("SUP-02", "Metro Wholesale Co", 5, 120),
    ("SUP-03", "QuickSupply Logistics", 2, 24),
    ("SUP-04", "HarvestLine Foods", 7, 96),
    ("SUP-05", "DailyNeeds Traders", 4, 60),
    ("SUP-06", "PrimeGoods Inc", 10, 200),
    ("SUP-07", "ValueChain Partners", 14, 240),
    ("SUP-08", "Neighborhood Supply", 6, 72),
]

# (name, category, base_daily_velocity, unit_cost, unit_price, target_cover_days)
# target_cover_days < 14  => at-risk SKU. Canary SKUs are pinned separately.
SKU_DEFS = [
    # Beverages
    ("Cola 500ml", "Beverages", 34, 0.55, 1.20, 22),
    ("Orange Juice 1L", "Beverages", 18, 1.10, 2.40, 9),
    ("Green Tea 100pk", "Beverages", 7, 2.80, 5.99, 31),
    ("Coffee Beans 500g", "Beverages", 11, 4.20, 8.99, 26),
    ("Sparkling Water 1L", "Beverages", 22, 0.45, 1.10, 45),
    ("Mango Nectar 1L", "Beverages", 14, 0.95, 2.10, 12),
    ("Energy Drink 250ml", "Beverages", 27, 0.80, 1.99, 6),
    ("Iced Tea 500ml", "Beverages", 16, 0.60, 1.35, 28),
    ("Coconut Water 1L", "Beverages", 9, 1.30, 2.75, 52),
    # Snacks
    ("Potato Chips 150g", "Snacks", 38, 0.70, 1.60, 18),
    ("Tortilla Chips 200g", "Snacks", 21, 0.85, 1.95, 33),
    ("Peanuts 500g", "Snacks", 13, 1.60, 3.40, 11),
    ("Chocolate Bar 100g", "Snacks", 29, 0.65, 1.50, 7),
    ("Cookies 300g", "Snacks", 17, 1.05, 2.30, 29),
    ("Popcorn 90g", "Snacks", 15, 0.50, 1.25, 41),
    ("Pretzels 250g", "Snacks", 8, 0.75, 1.70, 25),
    ("Granola Bar 6pk", "Snacks", 19, 1.45, 3.10, 16),
    ("Rice Cakes 120g", "Snacks", 6, 0.60, 1.40, 48),
    # Dairy
    ("Whole Milk 1L", "Dairy", 42, 0.70, 1.45, 5),
    ("Cheddar 200g", "Dairy", 12, 1.80, 3.60, 27),
    ("Yogurt 500g", "Dairy", 24, 0.90, 1.95, 19),
    ("Butter 250g", "Dairy", 14, 1.50, 3.10, 36),
    ("Mozzarella 125g", "Dairy", 9, 1.10, 2.35, 23),
    ("Cream Cheese 200g", "Dairy", 7, 1.25, 2.60, 44),
    ("Kefir 1L", "Dairy", 5, 1.40, 2.90, 30),
    ("Cottage Cheese 300g", "Dairy", 8, 1.00, 2.15, 13),
    ("Ghee 500ml", "Dairy", 6, 3.20, 6.50, 55),
    ("Flavored Milk 200ml", "Dairy", 26, 0.40, 0.95, 8),
    # Household
    ("Dish Soap 500ml", "Household", 9, 0.85, 1.90, 38),
    ("Laundry Detergent 2kg", "Household", 11, 3.40, 6.99, 25),
    ("Paper Towels 6pk", "Household", 13, 2.10, 4.50, 10),
    ("Trash Bags 30pk", "Household", 8, 1.60, 3.40, 32),
    ("All-Purpose Cleaner 750ml", "Household", 7, 1.15, 2.55, 47),
    ("Sponges 5pk", "Household", 5, 0.70, 1.60, 28),
    ("Bleach 1L", "Household", 6, 0.65, 1.45, 21),
    ("Air Freshener", "Household", 10, 1.20, 2.75, 15),
    ("Mop Refill", "Household", 3, 2.40, 5.10, 60),
    ("Dishwasher Tabs 30pk", "Household", 9, 2.80, 5.75, 26),
    # Personal Care
    ("Shampoo 400ml", "Personal Care", 12, 1.90, 4.10, 34),
    ("Toothpaste 150g", "Personal Care", 14, 1.10, 2.45, 20),
    ("Soap Bar 4pk", "Personal Care", 10, 1.30, 2.85, 42),
    ("Hand Sanitizer 250ml", "Personal Care", 7, 0.95, 2.10, 12),
    ("Deodorant 150ml", "Personal Care", 9, 1.50, 3.25, 29),
    ("Face Wash 150ml", "Personal Care", 8, 1.70, 3.60, 50),
    ("Lotion 400ml", "Personal Care", 6, 1.85, 3.95, 24),
    ("Razor 5pk", "Personal Care", 5, 2.20, 4.75, 37),
    ("Cotton Pads 100pk", "Personal Care", 4, 0.80, 1.85, 18),
    ("Lip Balm", "Personal Care", 11, 0.55, 1.30, 9),
    # Frozen
    ("Peas 1kg", "Frozen", 8, 1.00, 2.20, 46),
    ("Pizza 400g", "Frozen", 16, 1.75, 3.80, 20),
    ("Ice Cream 1L", "Frozen", 20, 1.60, 3.50, 22),
    ("Berries 500g", "Frozen", 7, 2.30, 4.90, 31),
    ("Fries 1kg", "Frozen", 13, 1.20, 2.65, 27),
    ("Fish Fillets 500g", "Frozen", 6, 2.90, 5.95, 53),
    ("Dumplings 400g", "Frozen", 11, 1.45, 3.15, 17),
    ("Spinach 500g", "Frozen", 5, 0.90, 1.95, 40),
    ("Chicken Nuggets 750g", "Frozen", 15, 2.10, 4.40, 11),
]

# Canary SKUs: constant daily sales (no noise) -> exact hand-verifiable cover.
# (sku_id, name, category, daily_units, on_hand, unit_cost, unit_price, supplier)
CANARIES = [
    ("SKU-001", "Canary Cola 500ml", "Beverages", 10, 100, 0.55, 1.20, "SUP-01"),
    ("SKU-002", "Canary Chips 150g", "Snacks", 5, 50, 0.70, 1.60, "SUP-02"),
    ("SKU-003", "Canary Milk 1L", "Dairy", 25, 200, 0.70, 1.45, "SUP-05"),
]
# Expected: SKU-001 -> 10.0 days cover, stockout 2026-10-22
#           SKU-002 -> 10.0 days cover, stockout 2026-10-22
#           SKU-003 ->  8.0 days cover, stockout 2026-10-20

WEEKEND_UPLIFT = {
    "Beverages": 1.35, "Snacks": 1.35, "Dairy": 1.30, "Frozen": 1.25,
    "Household": 1.10, "Personal Care": 1.10,
}
PROMO_SKU_NAMES = {"Iced Tea 500ml", "Butter 250g", "Cotton Pads 100pk"}  # 2.5x promo, days 60-73


def daily_units(base, category, day_index, sale_date, promo=False):
    weekend = 1.0
    if sale_date.weekday() >= 5:
        weekend = WEEKEND_UPLIFT[category]
    trend = 1.0 + 0.0015 * day_index
    noise = rng.uniform(0.8, 1.2)
    units = base * weekend * trend * noise
    if promo:
        units *= 2.5
    return max(0, round(units))


def esc(s):
    return s.replace("'", "''")


def main():
    out = []
    out.append("-- Generated by fixtures/seed.py (seed=%d). DO NOT EDIT BY HAND." % SEED)
    out.append("-- Regenerate: python3 fixtures/seed.py")
    out.append("TRUNCATE sales_daily, inventory, skus, suppliers;")
    out.append("")
    for sid, name, lead, moq in SUPPLIERS:
        out.append(
            "INSERT INTO suppliers VALUES ('%s','%s',%d,%d);"
            % (sid, esc(name), lead, moq)
        )
    out.append("")

    sku_rows = []  # (sku_id, name, category, cost, price, supplier, is_canary, avg28, on_hand)

    # Canaries first (fixed SKU-001..003)
    for sku_id, name, category, daily, on_hand, cost, price, sup in CANARIES:
        out.append(
            "INSERT INTO skus VALUES ('%s','%s','%s',%.2f,%.2f,'%s',TRUE);"
            % (sku_id, esc(name), category, cost, price, sup)
        )
        out.append(
            "INSERT INTO inventory VALUES ('%s',%d,'%s');"
            % (sku_id, on_hand, REF_DATE.isoformat())
        )
        for d in range(SALES_DAYS):
            sd = REF_DATE - timedelta(days=SALES_DAYS - d)
            out.append(
                "INSERT INTO sales_daily VALUES ('%s','%s',%d);"
                % (sku_id, sd.isoformat(), daily)
            )
        sku_rows.append((sku_id, daily, on_hand))
    out.append("")

    # Regular SKUs (SKU-004 .. SKU-060)
    idx = 4
    for i, (name, category, base, cost, price, target_cover) in enumerate(SKU_DEFS):
        sku_id = "SKU-%03d" % idx
        idx += 1
        supplier = SUPPLIERS[i % len(SUPPLIERS)][0]
        # NOTE: skus/inventory rows must come BEFORE sales_daily (FK constraint).
        out.append(
            "INSERT INTO skus VALUES ('%s','%s','%s',%.2f,%.2f,'%s',FALSE);"
            % (sku_id, esc(name), category, cost, price, supplier)
        )
        daily = []
        for d in range(SALES_DAYS):
            sd = REF_DATE - timedelta(days=SALES_DAYS - d)
            promo = name in PROMO_SKU_NAMES and 60 <= d <= 73
            u = daily_units(base, category, d, sd, promo)
            daily.append(u)
            out.append(
                "INSERT INTO sales_daily VALUES ('%s','%s',%d);"
                % (sku_id, sd.isoformat(), u)
            )
        avg28 = sum(daily[-COVER_WINDOW:]) / COVER_WINDOW
        on_hand = max(1, round(target_cover * avg28))
        out.append(
            "INSERT INTO inventory VALUES ('%s',%d,'%s');"
            % (sku_id, on_hand, REF_DATE.isoformat())
        )
        sku_rows.append((sku_id, avg28, on_hand))
    out.append("")

    path = Path(__file__).parent / "seed.sql"
    path.write_text("\n".join(out) + "\n")
    n_sales = sum(1 for l in out if l.startswith("INSERT INTO sales_daily"))

    # Self-check report
    at_risk = sum(1 for _, avg, oh in sku_rows if avg > 0 and oh / avg < RISK_THRESHOLD_DAYS)
    print("wrote %s" % path)
    print("SKUs: %d (canaries: 3), sales rows: %d, at-risk (<14d cover): %d"
          % (len(sku_rows), n_sales, at_risk))
    for sku_id, daily, on_hand in sku_rows[:3]:
        print("canary %s: cover=%.1f days (expect %s)"
              % (sku_id, on_hand / daily,
                 {"SKU-001": "10.0", "SKU-002": "10.0", "SKU-003": "8.0"}[sku_id]))


if __name__ == "__main__":
    main()
