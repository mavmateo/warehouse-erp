// ── Scan types ────────────────────────────────────────────────────────────────
export type ScanType = "sales" | "expenses" | "inventory" | "customers";
export type Phase    = "idle" | "scanning" | "review" | "saving" | "done";

export const SCAN_TYPES: {
  id:    ScanType;
  label: string;
  icon:  string;
  desc:  string;
  hint:  string;
}[] = [
  {
    id:    "sales",
    label: "Sales Record",
    icon:  "🧾",
    desc:  "Daily sales written on paper",
    hint:  "Customer name, items sold, qty, prices, payment method",
  },
  {
    id:    "expenses",
    label: "Expenses",
    icon:  "💸",
    desc:  "Receipt, invoice or expense list",
    hint:  "Date, description, amount, category (Rent / Utilities / Wages…)",
  },
  {
    id:    "inventory",
    label: "Inventory List",
    icon:  "📦",
    desc:  "Stock list or supplier price list",
    hint:  "Product names, categories, buy/sell prices, stock quantity",
  },
  {
    id:    "customers",
    label: "Customer List",
    icon:  "👥",
    desc:  "Customer contact sheet or notebook page",
    hint:  "Names, phone numbers, locations",
  },
];

// ── Parsed data shapes (mirrors Edge Function schemas) ────────────────────────
export interface ParsedSaleItem {
  product_name: string;
  quantity:     number;
  unit_price:   number;
  matched_id:   number | null;
  matched_name: string | null;
}
export interface ParsedSale {
  customer:       string | null;
  date:           string;
  payment_method: string;
  items:          ParsedSaleItem[];
  total:          number;
  confidence:     "high" | "medium" | "low";
  notes:          string;
}

export interface ParsedExpense {
  expense_date: string;
  description:  string;
  amount:       number;
  category:     string;
}
export interface ParsedExpenses {
  expenses:   ParsedExpense[];
  confidence: "high" | "medium" | "low";
  notes:      string;
}

export interface ParsedProduct {
  name:       string;
  sku:        string | null;
  category:   string;
  buy_price:  number;
  sell_price: number;
  stock:      number;
  unit:       string;
  supplier:   string | null;
  matched_id: number | null;  // existing product ID if name matches
}
export interface ParsedInventory {
  products:   ParsedProduct[];
  confidence: "high" | "medium" | "low";
  notes:      string;
}

export interface ParsedCustomer {
  name:     string;
  phone:    string | null;
  location: string | null;
  notes:    string | null;
  exists:   boolean;   // true if already in DB
}
export interface ParsedCustomers {
  customers:  ParsedCustomer[];
  confidence: "high" | "medium" | "low";
  notes:      string;
}

// ── Confidence display helpers ────────────────────────────────────────────────
export const CONF_COLOR = { high: "#16a34a", medium: "#d97706", low: "#dc2626" };
export const CONF_BG    = { high: "#F0FDF4", medium: "#FFFBEB", low: "#FEF2F2" };
export const CONF_LABEL = {
  high:   "✓ High confidence",
  medium: "⚠ Medium confidence — please review",
  low:    "⚠ Low confidence — review carefully",
};
