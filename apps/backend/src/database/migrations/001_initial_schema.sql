-- Migration: 001_initial_schema
-- Applied to Supabase project: theqmgdegpotidrdhwqj (baleshop-gh)
-- Run date: 2026-03-07

CREATE TABLE IF NOT EXISTS products (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  sku           TEXT,
  category      TEXT,
  buy_price     NUMERIC(10,2) DEFAULT 0,
  sell_price    NUMERIC(10,2) DEFAULT 0,
  stock         INTEGER DEFAULT 0,
  unit          TEXT DEFAULT 'bale',
  reorder_level INTEGER DEFAULT 5,
  supplier      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  address    TEXT,
  balance    NUMERIC(10,2) DEFAULT 0,
  last_order DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id             BIGSERIAL PRIMARY KEY,
  sale_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  customer       TEXT DEFAULT 'Walk-in',
  payment_method TEXT DEFAULT 'Cash',
  total          NUMERIC(10,2) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           BIGSERIAL PRIMARY KEY,
  sale_id      BIGINT REFERENCES sales(id) ON DELETE CASCADE,
  product_id   BIGINT REFERENCES products(id),
  product_name TEXT,
  quantity     INTEGER DEFAULT 1,
  unit_price   NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id           BIGSERIAL PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT,
  amount       NUMERIC(10,2) DEFAULT 0,
  category     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;

-- Anon policies (single-user shop app)
CREATE POLICY "anon_all_products"   ON products   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_suppliers"  ON suppliers  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sales"      ON sales      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sale_items" ON sale_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_expenses"   ON expenses   FOR ALL TO anon USING (true) WITH CHECK (true);

-- AI Query Panel helper function
CREATE OR REPLACE FUNCTION run_query(sql text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result json; BEGIN
  IF lower(trim(sql)) NOT LIKE 'select%' AND lower(trim(sql)) NOT LIKE 'with%' THEN
    RAISE EXCEPTION 'Only SELECT / WITH queries are allowed';
  END IF;
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END; $$;

GRANT EXECUTE ON FUNCTION run_query(text) TO anon;
