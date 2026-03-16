import { useState, useEffect } from "react";
import { Spin } from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch } from "@/lib/api";
import { fmt } from "@/lib/utils";
import type { Product } from "@erp/types";
import type { ParsedInventory, ParsedProduct } from "./types";
import { ReviewSidebar, DoneScreen } from "./shared";

const CATEGORIES = ["Bedding","Children","Women","Men","Household","Mixed","Other"];
const UNITS       = ["bale","half-bale","bundle","piece","sack","bag","unit"];

interface Props { raw: Record<string, unknown>; ocrText: string; preview: string; onReset: () => void; onSaved: () => void; }

export function InventoryReviewer({ raw, ocrText, preview, onReset, onSaved }: Props) {
  const [existing, setExisting] = useState<Product[]>([]);
  const [data,     setData]     = useState<ParsedInventory | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    dbGet<Product[]>("/products?order=name").then((prods) => {
      setExisting(prods);
      const parsed = raw as unknown as ParsedInventory;
      // Check each product against existing by name
      const products: ParsedProduct[] = parsed.products.map((p) => {
        const norm = (s: string) => s.toLowerCase().trim();
        const match = prods.find((x) => norm(x.name) === norm(p.name));
        return { ...p, matched_id: match?.id ?? null };
      });
      setData({ ...parsed, products });
    });
  }, []);

  if (!data) return <div style={{ padding:40, textAlign:"center", color:"var(--mu)" }}>Loading…</div>;
  if (done) return <DoneScreen message={`${data.products.length} product${data.products.length !== 1 ? "s" : ""} saved to inventory.`} onAnother={onReset} />;

  const setProduct = (i: number, patch: Partial<ParsedProduct>) =>
    setData((d) => {
      if (!d) return d;
      const products = [...d.products];
      products[i] = { ...products[i], ...patch };
      if (patch.name !== undefined) {
        const norm = (s: string) => s.toLowerCase().trim();
        const match = existing.find((x) => norm(x.name) === norm(patch.name!));
        products[i].matched_id = match?.id ?? null;
      }
      return { ...d, products };
    });

  const addProduct = () =>
    setData((d) => d ? { ...d, products: [...d.products, { name:"", sku:null, category:"Mixed", buy_price:0, sell_price:0, stock:0, unit:"bale", supplier:null, matched_id:null }] } : d);

  const removeProduct = (i: number) =>
    setData((d) => d ? { ...d, products: d.products.filter((_, idx) => idx !== i) } : d);

  const save = async () => {
    if (!data.products.length) return;
    setSaving(true); setError(null);
    try {
      await Promise.all(data.products.map((p) => {
        const body = { name: p.name, sku: p.sku, category: p.category, buy_price: +p.buy_price, sell_price: +p.sell_price, stock: +p.stock, unit: p.unit, supplier: p.supplier };
        return p.matched_id
          ? dbPatch(`/products?id=eq.${p.matched_id}`, body)   // update existing
          : dbPost("/products", body);                           // create new
      }));
      onSaved(); setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const newCount      = data.products.filter((p) => !p.matched_id).length;
  const updateCount   = data.products.filter((p) => p.matched_id).length;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:20 }}>
      <ReviewSidebar preview={preview} confidence={data.confidence} notes={data.notes} ocrText={ocrText} />

      <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)", display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontFamily:"Playfair Display", fontSize:20, color:"var(--gr)" }}>📦 Review Inventory</h3>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {newCount > 0    && <span style={{ fontSize:12, background:"#D1FAE5", color:"#065F46", padding:"3px 10px", borderRadius:10, fontWeight:600 }}>+{newCount} new</span>}
            {updateCount > 0 && <span style={{ fontSize:12, background:"#DBEAFE", color:"#1D4ED8", padding:"3px 10px", borderRadius:10, fontWeight:600 }}>↑{updateCount} update</span>}
            <button onClick={addProduct} className="btn bgh" style={{ fontSize:12, padding:"6px 14px" }}>+ Add</button>
          </div>
        </div>
        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", fontSize:13, color:"var(--rd)" }}>⚠️ {error}</div>}

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", border:"1px solid var(--crd)", borderRadius:12, overflow:"hidden" }}>
            <thead><tr style={{ background:"var(--cr)" }}>
              {["Status","Name","Category","Buy GH₵","Sell GH₵","Stock","Unit","Supplier",""].map((h) => (
                <th key={h} style={{ padding:"8px 10px", fontSize:10, textAlign:"left", fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.products.map((p, i) => (
                <tr key={i} style={{ borderTop:"1px solid var(--crd)", background: p.matched_id ? "#EFF6FF" : "white" }}>
                  <td style={{ padding:"8px 10px" }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:8, background: p.matched_id ? "#DBEAFE" : "#D1FAE5", color: p.matched_id ? "#1D4ED8" : "#065F46" }}>
                      {p.matched_id ? "↑ Update" : "+ New"}
                    </span>
                  </td>
                  <td style={{ padding:"8px 10px" }}>
                    <input type="text" value={p.name} onChange={(e) => setProduct(i, { name: e.target.value })} style={{ width:140, fontSize:13, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                  </td>
                  <td style={{ padding:"8px 10px" }}>
                    <select value={p.category} onChange={(e) => setProduct(i, { category: e.target.value })} style={{ fontSize:12, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:"8px 10px" }}><input type="number" min="0" step="0.01" value={p.buy_price} onChange={(e) => setProduct(i, { buy_price: +e.target.value })} style={{ width:80, textAlign:"right", fontSize:12, padding:"3px 6px", borderRadius:6, border:"1px solid var(--crd)", fontFamily:"Space Mono" }}/></td>
                  <td style={{ padding:"8px 10px" }}><input type="number" min="0" step="0.01" value={p.sell_price} onChange={(e) => setProduct(i, { sell_price: +e.target.value })} style={{ width:80, textAlign:"right", fontSize:12, padding:"3px 6px", borderRadius:6, border:"1px solid var(--crd)", fontFamily:"Space Mono" }}/></td>
                  <td style={{ padding:"8px 10px" }}><input type="number" min="0" value={p.stock} onChange={(e) => setProduct(i, { stock: +e.target.value })} style={{ width:60, textAlign:"center", fontSize:12, padding:"3px 6px", borderRadius:6, border:"1px solid var(--crd)" }}/></td>
                  <td style={{ padding:"8px 10px" }}>
                    <select value={p.unit} onChange={(e) => setProduct(i, { unit: e.target.value })} style={{ fontSize:12, padding:"3px 6px", borderRadius:6, border:"1px solid var(--crd)" }}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:"8px 10px" }}><input type="text" value={p.supplier ?? ""} onChange={(e) => setProduct(i, { supplier: e.target.value || null })} style={{ width:120, fontSize:12, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}/></td>
                  <td style={{ padding:"8px 8px" }}>
                    <button onClick={() => removeProduct(i)} style={{ width:26, height:26, borderRadius:6, border:"none", background:"#FEE2E2", color:"var(--rd)", cursor:"pointer", fontSize:14 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:12, borderTop:"1px solid var(--crd)" }}>
          <div style={{ fontSize:13, color:"var(--mu)" }}>
            {newCount > 0 && <span style={{ marginRight:12 }}>✦ {newCount} new product{newCount !== 1 ? "s" : ""} will be created</span>}
            {updateCount > 0 && <span>↑ {updateCount} existing product{updateCount !== 1 ? "s" : ""} will be updated</span>}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn bgh" onClick={onReset}>Cancel</button>
            <button className="btn bp" onClick={save} disabled={saving || data.products.length === 0} style={{ minWidth:180, justifyContent:"center" }}>
              {saving ? <><Spin/> Saving…</> : `✓ Save ${data.products.length} Product${data.products.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
