import { Injectable, BadRequestException } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sale, SaleItem, SaleWithItems, SaleInsert } from "@erp/types";

export interface CreateSaleDto extends SaleInsert {
  items: { product_id: number; product_name: string; quantity: number; unit_price: number }[];
}

@Injectable()
export class SalesService {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<SaleWithItems[]> {
    const { data: sales, error: se } = await this.db
      .from("sales")
      .select("*")
      .order("sale_date", { ascending: false });
    if (se) throw se;

    const { data: items, error: ie } = await this.db.from("sale_items").select("*");
    if (ie) throw ie;

    return (sales as Sale[]).map((s) => ({
      ...s,
      items: (items as SaleItem[]).filter((i) => i.sale_id === s.id),
    }));
  }

  async createSale(dto: CreateSaleDto): Promise<SaleWithItems> {
    if (!dto.items?.length) throw new BadRequestException("Sale must have at least one item");

    const total = dto.items.reduce((a, i) => a + i.quantity * i.unit_price, 0);

    // Insert sale
    const { data: saleRow, error: se } = await this.db
      .from("sales")
      .insert({ sale_date: dto.sale_date, customer: dto.customer, payment_method: dto.payment_method, total })
      .select()
      .single();
    if (se) throw se;

    // Insert items
    const { data: itemRows, error: ie } = await this.db
      .from("sale_items")
      .insert(dto.items.map((i) => ({ ...i, sale_id: (saleRow as Sale).id })))
      .select();
    if (ie) throw ie;

    // Decrement stock for each item
    await Promise.all(
      dto.items.map((i) =>
        this.db.rpc("run_query", {
          sql: `UPDATE products SET stock = stock - ${i.quantity} WHERE id = ${i.product_id}`,
        }),
      ),
    );

    return { ...(saleRow as Sale), items: itemRows as SaleItem[] };
  }
}
