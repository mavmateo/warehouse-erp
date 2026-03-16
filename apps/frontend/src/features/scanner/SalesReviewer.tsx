import { useState, useEffect } from "react";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch } from "@/lib/api";
import { fmt } from "@/lib/utils";
import type { Product } from "@erp/types";
import type { ParsedSale, ParsedSaleItem } from "./types";
import { ReviewSidebar, DoneScreen } from "./shared";

interface Customer { id: number; name: string; phone: string | null; }

const PAYMENT_METHODS = ["Cash", "MoMo", "Bank Transfer", "Credit"];

function fuzzyMatch(query: string, candidates: Product[]): Product | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  const q = norm(query);
  let best: Product | null = null, bestScore = 0;
  for (const p of candidates) {
    const pWords = norm(p.name).split(" ").filter(Boolean);
    const qWords = q.split(" ").filter(Boolean);
    const overlap = qWords.filter((w) => pWords.some((pw) => pw.includes(w) || w.includes(pw))).length;
    const score = overlap / Math.max(qWords.length, pWords.length);
    if (score > bestScore && score >= 0.3) { best = p; bestScore = score; }
  }
  return best;
}

interface Props {
  raw:      Record<string, unknown>;
  ocrText:  string;
  preview:  string;
  onReset:  () => void;
  onSaved:  () => void;
}

export function SalesReviewer({ raw, ocrText, preview, onReset, onSaved }: Props) {
  const [products,  setProducts]  = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custSugs,  setCustSugs]  = useState<Customer[]>([]);
  const [showSugs,  setShowSugs]  = useState(false);
  const [sale,      setSale]      = useState<ParsedSale | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    dbGet<Product[]>("/products?order=name").then((prods) => {
      setProducts(prods);
      // Enrich items with product matches once we have products
      const parsed = raw as unknown as ParsedSale;
      const items: ParsedSaleItem[] = (parsed.items ?? []).map((item) => {
        const match = fuzzyMatch(item.product_name, prods);
        return { ...item, matched_id: match?.id ?? null, matched_name: match?.name ?? null };
      });
      setSale({ ...parsed, items });
    });
    dbGet<Customer[]>("/customers?select=id,name,phone&order=name").then(setCustomers);
  }, []);

  if (!sale) return <div style={{ padding:40, textAlign:"center", color:"var(--mu)" }}>Loading…</div>;
  if (done) return <DoneScreen message="Sale record saved. Stock levels updated automatically." onAnother={onReset} />;

  const setField = <K extends keyof ParsedSale>(k: K, v: ParsedSale[K]) =>
    setSale((s) => s ? { ...s, [k]: v } : s);

  const setItem = (i: number, patch: Partial<ParsedSaleItem>) =>
    setSale((s) => {
      if (!s) return s;
      const items = [...s.items];
      items[i] = { ...items[i], ...patch };
      if (patch.product_name !== undefined) {
        const m = fuzzyMatch(patch.product_name, products);
        items[i].matched_id = m?.id ?? null; items[i].matched_name = m?.name ?? null;
      }
      return { ...s, items, total: items.reduce((a, it) => a + it.quantity * it.unit_price, 0) };
    });

  const addItem = () => setSale((s) => s ? { ...s,
    items: [...s.items, { product_name:"", quantity:1, unit_price:0, matched_id:null, matched_name:null }] } : s);

  const removeItem = (i: number) => setSale((s) => {
    if (!s) return s;
    const items = s.items.filter((_, idx) => idx !== i);
    return { ...s, items, total: items.reduce((a, it) => a + it.quantity * it.unit_price, 0) };
  });

  const save = async () => {
    if (!sale.items.length) return;
    setSaving(true); setError(null);
    try {
      const trimmedName = sale.customer?.trim() || null;
      let customerId: number | null = null;
      if (trimmedName) {
        const exact = customers.find((c) => c.name.toLowerCase() === trimmedName.toLowerCase());
        if (exact) customerId = exact.id;
        else { const [nc] = await dbPost<[Customer]>("/customers", { name: trimmedName }); customerId = nc.id; }
      }
      const total = sale.items.reduce((a, it) => a + it.quantity * it.unit_price, 0);
      const payload: Record<string, unknown> = { sale_date: sale.date, customer: trimmedName ?? "Walk-in", payment_method: sale.payment_method, total };
      if (customerId) payload.customer_id = customerId;
      const [saleRow] = await dbPost<[{ id: number }]>("/sales", payload);
      await Promise.all(sale.items.map((item) => dbPost("/sale_items", { sale_id: saleRow.id, product_id: item.matched_id ?? null, product_name: item.matched_name ?? item.product_name, quantity: item.quantity, unit_price: item.unit_price })));
      await Promise.all(sale.items.map((item) => {
        if (!item.matched_id) return Promise.resolve();
        const p = products.find((x) => x.id === item.matched_id);
        return p ? dbPatch(`/products?id=eq.${item.matched_id}`, { stock: p.stock - item.quantity }) : Promise.resolve();
      }));
      onSaved(); setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:20 }}>
      <ReviewSidebar preview={preview} confidence={sale.confidence} notes={sale.notes} ocrText={ocrText} />

      <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)", display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontFamily:"Playfair Display", fontSize:20, color:"var(--gr)" }}>🧾 Review Sale</h3>
          <span style={{ fontSize:12, color:"var(--mu)" }}>Edit anything before saving</span>
        </div>
        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", fontSize:13, color:"var(--rd)" }}>⚠️ {error}</div>}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {/* Customer */}
          <div style={{ position:"relative" }}>
            <Field label="Customer">
              <input type="text" value={sale.customer ?? ""} placeholder="Walk-in"
                onChange={(e) => { setField("customer", e.target.value || null); const m = customers.filter((c) => c.name.toLowerCase().includes(e.target.value.toLowerCase())); setCustSugs(m.slice(0,6)); setShowSugs(e.target.value.length > 0 && m.length > 0); }}
                onBlur={() => setTimeout(() => setShowSugs(false), 150)} />
            </Field>
            {showSugs && (
              <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"var(--wh)", border:"1px solid var(--crd)", borderRadius:10, boxShadow:"var(--sh)", zIndex:99, maxHeight:160, overflowY:"auto" }}>
                {custSugs.map((c) => (
                  <div key={c.id} onMouseDown={() => { setField("customer", c.name); setShowSugs(false); }}
                    style={{ padding:"8px 14px", cursor:"pointer", fontSize:13 }}>
                    <div style={{ fontWeight:600 }}>{c.name}</div>
                    {c.phone && <div style={{ fontSize:11, color:"var(--mu)" }}>{c.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Field label="Date"><input type="date" value={sale.date} onChange={(e) => setField("date", e.target.value)} /></Field>
          <Field label="Payment">
            <select value={sale.payment_method} onChange={(e) => setField("payment_method", e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        {/* Items */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>Items</label>
            <button onClick={addItem} className="btn bgh" style={{ fontSize:12, padding:"4px 12px" }}>+ Add</button>
          </div>
          <div style={{ border:"1px solid var(--crd)", borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"var(--cr)" }}>
                {["OCR Name","Matched Product","Qty","Unit Price","Subtotal",""].map((h) => (
                  <th key={h} style={{ padding:"8px 12px", fontSize:11, textAlign: h === "Qty" ? "center" : h === "Unit Price" || h === "Subtotal" ? "right" : "left", fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr key={i} style={{ borderTop:"1px solid var(--crd)" }}>
                    <td style={{ padding:"8px 12px" }}><input type="text" value={item.product_name} onChange={(e) => setItem(i, { product_name: e.target.value })} style={{ width:"100%", fontSize:13, padding:"4px 8px", borderRadius:6, border:"1px solid var(--crd)" }}/></td>
                    <td style={{ padding:"8px 12px" }}>
                      <select value={item.matched_id ?? ""} onChange={(e) => { const p = products.find((x) => x.id === +e.target.value); setItem(i, { matched_id: p?.id ?? null, matched_name: p?.name ?? null, unit_price: p ? +p.sell_price : item.unit_price }); }}
                        style={{ width:"100%", fontSize:12, padding:"4px 8px", borderRadius:6, border:`1px solid ${item.matched_id ? "#86efac" : "#fca5a5"}`, background: item.matched_id ? "#F0FDF4" : "#FEF2F2" }}>
                        <option value="">⚠ No match</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:"8px 12px", textAlign:"center" }}><input type="number" min="1" value={item.quantity} onChange={(e) => setItem(i, { quantity: +e.target.value })} style={{ width:56, textAlign:"center", fontSize:13, padding:"4px 6px", borderRadius:6, border:"1px solid var(--crd)" }}/></td>
                    <td style={{ padding:"8px 12px" }}><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => setItem(i, { unit_price: +e.target.value })} style={{ width:90, textAlign:"right", fontSize:13, padding:"4px 8px", borderRadius:6, border:"1px solid var(--crd)", fontFamily:"Space Mono" }}/></td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"Space Mono", fontSize:13, fontWeight:600, color:"var(--grm)", whiteSpace:"nowrap" }}>{fmt(item.quantity * item.unit_price)}</td>
                    <td style={{ padding:"8px 8px" }}><button onClick={() => removeItem(i)} style={{ width:26, height:26, borderRadius:6, border:"none", background:"#FEE2E2", color:"var(--rd)", cursor:"pointer", fontSize:14 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sale.items.some((it) => !it.matched_id) && (
            <div style={{ marginTop:8, background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#92400E" }}>
              ⚠️ Unmatched items won't decrement stock — you can still save.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:12, borderTop:"1px solid var(--crd)" }}>
          <div>
            <div style={{ fontSize:11, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>Total</div>
            <div style={{ fontFamily:"Space Mono", fontSize:24, fontWeight:700, color:"var(--grm)" }}>{fmt(sale.items.reduce((a, it) => a + it.quantity * it.unit_price, 0))}</div>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn bgh" onClick={onReset}>Cancel</button>
            <button className="btn bp" onClick={save} disabled={saving || sale.items.length === 0} style={{ minWidth:160, justifyContent:"center" }}>
              {saving ? <><Spin/> Saving…</> : "✓ Save Sale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
