import { useState, useEffect } from "react";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch } from "@/lib/api";
import { today, fmt } from "@/lib/utils";
import type { Product, PaymentMethod } from "@erp/types";

interface CartItem { pid: number; name: string; price: number; qty: number; max: number; }

export function POS({ onRefresh }: { onRefresh: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart,     setCart]     = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("Walk-in");
  const [payment,  setPayment]  = useState<PaymentMethod>("Cash");
  const [search,   setSearch]   = useState("");
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);

  useEffect(() => { dbGet<Product[]>("/products?order=name&stock=gt.0").then(setProducts); }, []);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const total    = cart.reduce((a, i) => a + i.price * i.qty, 0);

  const addToCart = (p: Product) => setCart((prev) => {
    const ex = prev.find((i) => i.pid === p.id);
    if (ex) return prev.map((i) => i.pid === p.id ? { ...i, qty: Math.min(i.qty + 1, p.stock) } : i);
    return [...prev, { pid: p.id, name: p.name, price: +p.sell_price, qty: 1, max: +p.stock }];
  });

  const upQty = (pid: number, qty: number) => {
    if (qty < 1) return;
    setCart((prev) => prev.map((i) => i.pid === pid ? { ...i, qty: Math.min(qty, i.max) } : i));
  };

  const complete = async () => {
    if (!cart.length || saving) return;
    setSaving(true);
    try {
      const [saleRow] = await dbPost<[{ id: number }]>("/sales", { sale_date: today(), customer, payment_method: payment, total });
      await Promise.all(cart.map((item) =>
        dbPost("/sale_items", { sale_id: saleRow.id, product_id: item.pid, product_name: item.name, quantity: item.qty, unit_price: item.price }),
      ));
      await Promise.all(cart.map((item) => {
        const p = products.find((x) => x.id === item.pid);
        return p ? dbPatch(`/products?id=eq.${item.pid}`, { stock: p.stock - item.qty }) : Promise.resolve();
      }));
      onRefresh();
      setDone(true);
      setTimeout(() => { setCart([]); setCustomer("Walk-in"); setDone(false); setSaving(false); }, 2400);
    } catch (e) {
      alert("Error saving sale: " + (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fade-up" style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:20, height:"calc(100vh - 130px)" }}>
      {/* Product grid */}
      <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)",display:"flex",flexDirection:"column",gap:14,overflow:"hidden" }}>
        <div style={{ display:"flex",gap:10,alignItems:"center" }}>
          <h3 style={{ fontFamily:"Playfair Display",fontSize:20,color:"var(--gr)",flexShrink:0 }}>Stock Bales</h3>
          <input type="text" placeholder="Search bales…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex:1 }} />
        </div>
        <div style={{ overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,flex:1 }}>
          {filtered.map((p) => (
            <div key={p.id} onClick={() => addToCart(p)}
              style={{ background:"var(--cr)",borderRadius:12,padding:"12px 14px",cursor:"pointer",border:"2px solid transparent",transition:"all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor="var(--am)"; e.currentTarget.style.background="var(--crd)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor="transparent"; e.currentTarget.style.background="var(--cr)"; }}>
              <div style={{ fontSize:22,marginBottom:4 }}>🧺</div>
              <div style={{ fontWeight:600,fontSize:12,lineHeight:1.3,marginBottom:4 }}>{p.name}</div>
              <div style={{ fontWeight:700,color:"var(--am)",fontFamily:"Space Mono",fontSize:13 }}>{fmt(p.sell_price)}</div>
              <div style={{ fontSize:11,color:p.stock<=p.reorder_level?"var(--rd)":"var(--mu)",marginTop:3 }}>{p.stock} in stock</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)",display:"flex",flexDirection:"column",gap:14 }}>
        {done ? (
          <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
            <div style={{ fontSize:60,marginBottom:12 }}>🎉</div>
            <h3 style={{ fontFamily:"Playfair Display",fontSize:24,color:"var(--gr)",marginBottom:6 }}>Sale Complete!</h3>
            <div style={{ fontSize:32,fontWeight:700,fontFamily:"Space Mono",color:"var(--am)" }}>{fmt(total)}</div>
            <div style={{ color:"var(--mu)",marginTop:6,fontSize:13 }}>Saved to Supabase ✓</div>
          </div>
        ) : (
          <>
            <h3 style={{ fontFamily:"Playfair Display",fontSize:20,color:"var(--gr)" }}>Cart 🛒</h3>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <Field label="Customer"><input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
              <Field label="Payment">
                <select value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
                  {(["Cash","MoMo","Bank Transfer","Credit"] as PaymentMethod[]).map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8 }}>
              {!cart.length && <div style={{ textAlign:"center",padding:"30px 0",color:"var(--mu)" }}><div style={{ fontSize:36,marginBottom:6 }}>🛒</div>Click bales to add</div>}
              {cart.map((item) => (
                <div key={item.pid} style={{ background:"var(--cr)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{item.name}</div>
                    <div style={{ color:"var(--am)",fontFamily:"Space Mono",fontSize:12 }}>{fmt(item.price)}</div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <button onClick={() => upQty(item.pid,item.qty-1)} style={{ width:26,height:26,borderRadius:6,border:"1.5px solid var(--crd)",background:"white",fontWeight:700,fontSize:16 }}>−</button>
                    <span style={{ width:22,textAlign:"center",fontWeight:700,fontFamily:"Space Mono",fontSize:14 }}>{item.qty}</span>
                    <button onClick={() => upQty(item.pid,item.qty+1)} style={{ width:26,height:26,borderRadius:6,border:"1.5px solid var(--crd)",background:"white",fontWeight:700,fontSize:16 }}>+</button>
                  </div>
                  <div style={{ fontWeight:700,fontFamily:"Space Mono",fontSize:13,width:72,textAlign:"right" }}>{fmt(item.price*item.qty)}</div>
                  <button onClick={() => setCart((prev) => prev.filter((i) => i.pid !== item.pid))} style={{ color:"var(--rd)",background:"none",border:"none",fontSize:18,fontWeight:700 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop:"2px dashed var(--crd)",paddingTop:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                <span style={{ fontSize:16,fontWeight:600 }}>Total</span>
                <span style={{ fontFamily:"Space Mono",fontSize:26,fontWeight:700,color:"var(--gr)" }}>{fmt(total)}</span>
              </div>
              <button className="btn bg2" onClick={complete} style={{ width:"100%",justifyContent:"center",fontSize:15,padding:"14px",borderRadius:12 }} disabled={!cart.length || saving}>
                {saving ? <Spin /> : "Complete Sale ✓"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
