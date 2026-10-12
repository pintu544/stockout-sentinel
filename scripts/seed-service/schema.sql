-- Stockout Sentinel fixture schema (synthetic demo data).
-- Idempotent: safe to run multiple times (drops + recreates).
-- See fixtures/CONTRACT.md for the fixture contract.

DROP TABLE IF EXISTS sales_daily;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS skus;
DROP TABLE IF EXISTS suppliers;

CREATE TABLE suppliers (
    supplier_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    lead_time_days INTEGER NOT NULL CHECK (lead_time_days >= 0),
    min_order_units INTEGER NOT NULL CHECK (min_order_units > 0)
);

CREATE TABLE skus (
    sku_id      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    unit_cost   NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0),
    unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    supplier_id TEXT NOT NULL REFERENCES suppliers(supplier_id),
    is_canary   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE inventory (
    sku_id        TEXT PRIMARY KEY REFERENCES skus(sku_id),
    on_hand_units INTEGER NOT NULL CHECK (on_hand_units >= 0),
    updated_at    DATE NOT NULL
);

CREATE TABLE sales_daily (
    sku_id     TEXT NOT NULL REFERENCES skus(sku_id),
    sale_date  DATE NOT NULL,
    units_sold INTEGER NOT NULL CHECK (units_sold >= 0),
    PRIMARY KEY (sku_id, sale_date)
);

CREATE INDEX idx_sales_daily_date ON sales_daily (sale_date);
CREATE INDEX idx_skus_category ON skus (category);
