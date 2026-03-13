import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch, dbDelete } from "@/lib/api";
import { fmt } from "@/lib/utils";
import type { Product, ProductCategory, ProductUnit } from "@erp/types";

const WA_URL = (import.meta.env.VITE_WHATSAPP_SERVER_URL as string) || "http://localhost:3001";

/** Send a price-drop promo to all customers when sell price is reduced. Fire-and-forget. */
async function broadcastPriceReduction(productName: string, category: string, oldPrice: number, newPrice: number) {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/customers?select=name,phone&phone=not.is.null`,
      { headers: {
          "apikey":        import.meta.env.VITE_SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      }},
    );
    const customers: { name: string; phone: string }[] = await res.json();
    if (!customers.length) return;

    const pct = Math.round(((oldPrice - newPrice) / oldPrice) * 100);

    for (const c of customers) {
      const message =
        `Hi ${c.name}! 🎉 Price drop at BaleShop GH!
` +
        `🧺 *${productName}* (${category}) is now GH₵ ${newPrice.toFixed(2)} — that's ${pct}% off!
` +
        `Come in and grab yours before it sells out! — BaleShop GH, Kantamanto`;
      await fetch(`${WA_URL}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ recipients: [{ name: c.name, phone: c.phone }], message }),
        signal:  AbortSignal.timeout(10000),
      });
    }
  } catch {
    // Silently ignore
  }
}

/** Fetch all customers with phones and send them a new-stock WhatsApp. Fire-and-forget. */
async function broadcastNewStock(productName: string, category: string, sellPrice: number) {
  try {
    const res  = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/customers?select=name,phone&phone=not.is.null`,
      { headers: {
          "apikey":        import.meta.env.VITE_SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      }},
    );
    const customers: { name: string; phone: string }[] = await res.json();
    if (!customers.length) return;

    for (const c of customers) {
      const message =
        `Hi ${c.name}! 👋 New stock just arrived at BaleShop GH!\n` +
        `🧺 *${productName}* (${category}) — GH₵ ${sellPrice.toFixed(2)}\n` +
        `Come in early for the best selection! — BaleShop GH, Kantamanto`;
      await fetch(`${WA_URL}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ recipients: [{ name: c.name, phone: c.phone }], message }),
        signal:  AbortSignal.timeout(10000),
      });
    }
  } catch {
    // Silently ignore — sale/inventory save must never fail because of this
  }
}

const CATEGORIES: ProductCategory[] = ["Bedding","Children","Women","Men","Household","Mixed","Other"];
const UNITS:      ProductUnit[]      = ["bale","half-bale","bundle","piece","sack","bag","unit"];

type FormState = Partial<Product> & { id?: number };

export function Inventory({ onRefresh }: { onRefresh: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [form, setForm]         = useState<FormState>({});
  const [filter, setFilter]     = useState("All");
  const [saving, setSaving]     = useState(false);

  const load = () => dbGet<Product[]>("/products?order=name").then(setProducts);
  useEffect(() => { void load(); }, []);

  const cats = ["All", ...new Set(products.map((p) => p.category).filter(Boolean))];

  const save = async () => {
    if (!form.name || !form.sell_price) return;
    setSaving(true);
    try {
      const body = {
        name: form.name, sku: form.sku, category: form.category,
        buy_price: +(form.buy_price ?? 0), sell_price: +(form.sell_price ?? 0),
        stock: +(form.stock ?? 0), unit: form.unit,
        reorder_level: +(form.reorder_level ?? 4), supplier: form.supplier,
      };
      if (modal === "add") {
        await dbPost("/products", body);
        // Broadcast new stock arrival to all customers (fire-and-forget)
        void broadcastNewStock(form.name!, form.category ?? "Mixed", +(form.sell_price ?? 0));
      } else {
        const prevSellPrice = products.find((p) => p.id === form.id)?.sell_price;
        await dbPatch(`/products?id=eq.${form.id}`, body);
        if (prevSellPrice !== undefined && +(form.sell_price ?? 0) < +prevSellPrice) {
          void broadcastPriceReduction(form.name!, form.category ?? "Mixed", +prevSellPrice, +(form.sell_price ?? 0));
        }
      }
      load(); onRefresh(); setModal(null);
    } finally { setSaving(false); }
  };

  const filtered = filter === "All" ? products : products.filter((p) => p.category === filter);

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Inventory</h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>{products.length} bale types · Supabase PostgreSQL</p>
        </div>
        <button className="btn bp" onClick={() => { setForm({ category:"Bedding", unit:"bale", reorder_level:4 }); setModal("add"); }}>
          + Add Bale Type
        </button>
      </div>

      {/* Category filters */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {cats.map((c) => (
          <button key={c} onClick={() => setFilter(c)} style={{ padding:"6px 16px",borderRadius:20,border:"1.5px solid",borderColor:filter===c?"var(--am)":"var(--crd)",background:filter===c?"var(--am)":"transparent",color:filter===c?"white":"var(--mu)",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ background:"var(--wh)", borderRadius:16, boxShadow:"var(--sh)", overflow:"hidden" }}>
        <table>
          <thead><tr><th>Bale Name</th><th>SKU</th><th>Category</th><th>Buy</th><th>Sell</th><th>Margin</th><th>Stock</th><th>Supplier</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((p) => {
              const mg = p.buy_price > 0 ? (((p.sell_price - p.buy_price) / p.buy_price) * 100).toFixed(0) : "0";
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight:600 }}>{p.name}</td>
                  <td style={{ fontFamily:"Space Mono",fontSize:12,color:"var(--mu)" }}>{p.sku}</td>
                  <td><span className="badge bb">{p.category}</span></td>
                  <td style={{ fontFamily:"Space Mono",fontSize:13 }}>{fmt(p.buy_price)}</td>
                  <td style={{ fontFamily:"Space Mono",fontSize:13,fontWeight:700 }}>{fmt(p.sell_price)}</td>
                  <td><span className={`badge ${+mg >= 20 ? "bg" : "ba"}`}>{mg}%</span></td>
                  <td>
                    <span style={{ fontWeight:700,color:p.stock<=p.reorder_level?"var(--rd)":"var(--grm)" }}>{p.stock}</span>
                    <span style={{ color:"var(--mu)",fontSize:11 }}> {p.unit}</span>
                    {p.stock <= p.reorder_level && <span style={{ marginLeft:4,fontSize:12 }}>⚠️</span>}
                  </td>
                  <td style={{ fontSize:13 }}>{p.supplier}</td>
                  <td>
                    <div style={{ display:"flex",gap:6 }}>
                      <button className="btn bgh bs" onClick={() => { setForm({ ...p }); setModal("edit"); }}>✏ Edit</button>
                      <button className="btn bs" style={{ background:"#FEE2E2",color:"var(--rd)",border:"none" }} onClick={async () => { await dbDelete(`/products?id=eq.${p.id}`); load(); onRefresh(); }}>×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === "add" ? "Add Bale Type" : "Edit Bale"} onClose={() => setModal(null)}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <Field label="Bale Name"><input type="text" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kids Flannel Bale" /></Field>
            </div>
            <Field label="SKU"><input type="text" value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Category">
              <select value={form.category ?? "Bedding"} onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Buy Price (GH₵)"><input type="number" value={form.buy_price ?? ""} onChange={(e) => setForm({ ...form, buy_price: +e.target.value })} /></Field>
            <div>
              <Field label="Sell Price (GH₵)"><input type="number" value={form.sell_price ?? ""} onChange={(e) => setForm({ ...form, sell_price: +e.target.value })} /></Field>
              <div style={{ display:"flex", gap:5, marginTop:5 }}>
                {[-75,-50,-25,25,50,75].map((pct) => {
                  const next = +(( (form.sell_price ?? 0) * (1 + pct/100) ).toFixed(2));
                  return (
                    <button key={pct} type="button"
                      onClick={() => setForm({ ...form, sell_price: next })}
                      style={{ flex:1, padding:"3px 0", fontSize:11, fontWeight:600, borderRadius:6, border:"1px solid", cursor:"pointer", transition:"all .12s",
                        background: pct < 0 ? "#FEF2F2" : "#F0FDF4",
                        borderColor: pct < 0 ? "#FECACA" : "#BBF7D0",
                        color:       pct < 0 ? "#DC2626" : "#16A34A",
                      }}>
                      {pct > 0 ? "+" : ""}{pct}%
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Stock"><input type="number" value={form.stock ?? ""} onChange={(e) => setForm({ ...form, stock: +e.target.value })} /></Field>
            <Field label="Reorder Level"><input type="number" value={form.reorder_level ?? ""} onChange={(e) => setForm({ ...form, reorder_level: +e.target.value })} /></Field>
            <Field label="Unit">
              <select value={form.unit ?? "bale"} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <div style={{ gridColumn:"1/-1" }}>
              <Field label="Supplier"><input type="text" value={form.supplier ?? ""} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
            </div>
          </div>
          <div style={{ display:"flex",gap:10,marginTop:20 }}>
            <button className="btn bp" onClick={save} style={{ flex:1,justifyContent:"center" }} disabled={saving}>
              {saving ? <Spin /> : "Save"}
            </button>
            <button className="btn bgh" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
