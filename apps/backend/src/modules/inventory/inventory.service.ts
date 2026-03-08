// ─── inventory.service.ts ─────────────────────────────────────────
import { Injectable, NotFoundException } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductInsert, ProductUpdate } from "@erp/types";

@Injectable()
export class InventoryService {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<Product[]> {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .order("name");
    if (error) throw error;
    return data as Product[];
  }

  async findOne(id: number): Promise<Product> {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) throw new NotFoundException(`Product ${id} not found`);
    return data as Product;
  }

  async create(dto: ProductInsert): Promise<Product> {
    const { data, error } = await this.db
      .from("products")
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    return data as Product;
  }

  async update(id: number, dto: ProductUpdate): Promise<Product> {
    const { data, error } = await this.db
      .from("products")
      .update(dto)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw new NotFoundException(`Product ${id} not found`);
    return data as Product;
  }

  async remove(id: number): Promise<void> {
    const { error } = await this.db.from("products").delete().eq("id", id);
    if (error) throw error;
  }

  async getLowStock(): Promise<Product[]> {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .filter("stock", "lte", "reorder_level");
    if (error) throw error;
    return data as Product[];
  }
}
