// ─────────────────────────────────────────────────────────────────
//  @erp/types  –  Shared domain types across frontend & backend
// ─────────────────────────────────────────────────────────────────

// ── Primitives ────────────────────────────────────────────────────
export type ISODate  = string;  // "YYYY-MM-DD"
export type ISOTimestamp = string;

// ── Products / Inventory ─────────────────────────────────────────
export type ProductCategory =
  | "Bedding" | "Children" | "Women" | "Men"
  | "Household" | "Mixed" | "Other";

export type ProductUnit =
  | "bale" | "half-bale" | "bundle" | "piece" | "sack" | "bag" | "unit";

export interface Product {
  id:            number;
  name:          string;
  sku:           string | null;
  category:      ProductCategory | null;
  buy_price:     number;
  sell_price:    number;
  stock:         number;
  unit:          ProductUnit;
  reorder_level: number;
  supplier:      string | null;
  created_at:    ISOTimestamp | null;
}

export type ProductInsert = Omit<Product, "id" | "created_at">;
export type ProductUpdate = Partial<ProductInsert>;

// ── Suppliers / Procurement ───────────────────────────────────────
export interface Supplier {
  id:         number;
  name:       string;
  phone:      string | null;
  address:    string | null;
  balance:    number;
  last_order: ISODate | null;
  created_at: ISOTimestamp | null;
}

export type SupplierInsert = Omit<Supplier, "id" | "created_at">;
export type SupplierUpdate = Partial<SupplierInsert>;

// ── Sales ─────────────────────────────────────────────────────────
export type PaymentMethod = "Cash" | "MoMo" | "Bank Transfer" | "Credit";

export interface Sale {
  id:             number;
  sale_date:      ISODate;
  customer:       string;
  payment_method: PaymentMethod;
  total:          number;
  created_at:     ISOTimestamp | null;
}

export interface SaleItem {
  id:           number;
  sale_id:      number;
  product_id:   number;
  product_name: string;
  quantity:     number;
  unit_price:   number;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
}

export type SaleInsert = Omit<Sale, "id" | "created_at">;

// ── Expenses / Accounting ─────────────────────────────────────────
export type ExpenseCategory =
  | "Rent" | "Utilities" | "Wages" | "Transport"
  | "Stock Purchase" | "Maintenance" | "Marketing" | "Other";

export interface Expense {
  id:           number;
  expense_date: ISODate;
  description:  string;
  amount:       number;
  category:     ExpenseCategory;
  created_at:   ISOTimestamp | null;
  supplier_id?: number | null ;
}

export type ExpenseInsert = Omit<Expense, "id" | "created_at">;

// ── Reports / Analytics ───────────────────────────────────────────
export interface ProfitLoss {
  revenue:    number;
  cogs:       number;
  gross:      number;
  expenses:   number;
  net:        number;
  net_margin: number;
}

export interface ProductPerformance extends Product {
  soldQty: number;
  revenue: number;
}

// ── API responses ─────────────────────────────────────────────────
export interface ApiResponse<T> {
  data:    T | null;
  error:   string | null;
  status:  number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page:  number;
  limit: number;
}
