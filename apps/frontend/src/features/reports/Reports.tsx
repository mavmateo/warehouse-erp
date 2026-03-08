import { useState, useEffect } from "react";
import { dbGet } from "@/lib/api";
import { fmt } from "@/lib/utils";
import type { Product, Sale, SaleItem, Expense } from "@erp/types";

export function Reports({ reload }: { reload: number }) {
  const [d, setD] = useState<{ products: Product[]; sales: Sale[]; items: SaleItem[]; expenses: Expense[] } | null>(null);

  useEffect(() => {
    Promise.all([
      dbGet<Product[]>("/products?order=name"),
      dbGet<Sale[]>("/sales"),
      dbGet<SaleItem[]>("/sale_items"),
      dbGet<Expense[]>("/expenses"),
    ]).then(([products, sales, items, expenses]) => setD({ products, sales, items, expenses }));
  }, [reload]);

  if (!d) return null;
  const { products, sales, items, expenses } = d;

  const rev   = sales.reduce((a, s) => a + +s.total, 0);
  const exp   = expenses.reduce((a, e) => a + +e.amount, 0);
  const cogs  = sales.reduce((acc, sale) =>
    acc + items.filter((i) => i.sale_id === sale.id).reduce((a, item) => {
      const p = products.find((x) => x.id === item.product_id);
      return a + (p ? +p.buy_price * item.quantity : 0);
    }, 0), 0);
  const gross = rev - cogs;
  const net   = gross - exp;

  const topP = products.map((p) => {
    const sold = items.filter((i) => i.product_id === p.id);
    return { ...p, soldQty: sold.reduce((a, i) => a + i.quantity, 0), revenue: sold.reduce((a, i) => a + +i.unit_price * i.quantity, 0) };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  const pays = (["Cash","MoMo","Bank Transfer","Credit"] as const).map((m) => ({
    method: m,
    count:  sales.filter((s) => s.payment_method === m).length,
    total:  sales.filter((s) => s.payment_method === m).reduce((a, s) => a + +s.total, 0),
  })).filter((x) => x.count > 0);

  const invC = products.reduce((a, p) => a + +p.buy_price  * +p.stock, 0);
  const invR = products.reduce((a, p) => a + +p.sell_price * +p.stock, 0);

  const plRows: [string, number | string, string][] = [
    ["Total Revenue", rev,  "var(--gd)"],
    ["Cost of Goods", cogs, "#FCA5A5"],
    ["Gross Profit",  gross, gross >= 0 ? "#6EE7B7" : "#FCA5A5"],
    ["Expenses",      exp,  "#FCA5A5"],
    ["Net Profit",    net,  net >= 0 ? "#6EE7B7" : "#FCA5A5"],
    ["Net Margin",    `${rev > 0 ? ((net / rev) * 100).toFixed(1) : 0}%`, net >= 0 ? "#6EE7B7" : "#FCA5A5"],
  ];

  return (
    <div className="fade-up">
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontFamily:"Playfair Display",fontSize:26,color:"var(--gr)" }}>Reports & Analytics</h2>
        <p style={{ color:"var(--mu)",fontSize:13 }}>Queried live from Supabase</p>
      </div>

      {/* P&L */}
      <div style={{ background:"var(--gr)",borderRadius:16,padding:24,marginBottom:20,color:"white" }}>
        <h3 style={{ fontFamily:"Playfair Display",fontSize:20,marginBottom:16,opacity:.9 }}>Profit & Loss Statement</h3>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16 }}>
          {plRows.map(([l, v, c]) => (
            <div key={l} style={{ background:"rgba(255,255,255,0.08)",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:11,opacity:.7,marginBottom:4,letterSpacing:".5px",textTransform:"uppercase" }}>{l}</div>
              <div style={{ fontFamily:"Space Mono",fontSize:20,fontWeight:700,color:c }}>{typeof v === "string" ? v : fmt(Math.abs(v))}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
        {/* Top sellers */}
        <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)" }}>
          <h4 style={{ fontFamily:"Playfair Display",fontSize:17,color:"var(--gr)",marginBottom:14 }}>🏆 Top Selling Bales</h4>
          {topP.map((p, i) => (
            <div key={p.id} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:i<3?"var(--am)":"var(--crd)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:i<3?"white":"var(--mu)",flexShrink:0 }}>{i+1}</div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{p.name}</div>
                <div style={{ background:"var(--crd)",borderRadius:3,height:5,marginTop:4 }}>
                  <div style={{ background:"var(--am)",height:"100%",borderRadius:3,width:`${(p.revenue/(topP[0]?.revenue||1))*100}%`,transition:"width .8s" }} />
                </div>
              </div>
              <div style={{ textAlign:"right",flexShrink:0 }}>
                <div style={{ fontFamily:"Space Mono",fontSize:12,fontWeight:700,color:"var(--grm)" }}>{fmt(p.revenue)}</div>
                <div style={{ fontSize:10,color:"var(--mu)" }}>{p.soldQty} sold</div>
              </div>
            </div>
          ))}
        </div>

        {/* Payments + Inventory */}
        <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)" }}>
          <h4 style={{ fontFamily:"Playfair Display",fontSize:17,color:"var(--gr)",marginBottom:14 }}>💳 Payment Methods</h4>
          {pays.map((m) => (
            <div key={m.method} style={{ marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
                <span style={{ fontWeight:600,fontSize:13 }}>{m.method}</span>
                <div>
                  <span style={{ fontFamily:"Space Mono",fontSize:12,color:"var(--grm)",fontWeight:700 }}>{fmt(m.total)}</span>
                  <span style={{ fontSize:11,color:"var(--mu)",marginLeft:6 }}>{m.count} txns</span>
                </div>
              </div>
              <div style={{ background:"var(--crd)",borderRadius:4,height:8 }}>
                <div style={{ background:"var(--grm)",height:"100%",borderRadius:4,width:`${(m.total/Math.max(rev,1))*100}%`,transition:"width .8s" }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop:20,paddingTop:16,borderTop:"1px solid var(--crd)" }}>
            <h4 style={{ fontFamily:"Playfair Display",fontSize:17,color:"var(--gr)",marginBottom:12 }}>📦 Inventory Value</h4>
            {([["Cost Value",invC,"var(--tx)"],["Retail Value",invR,"var(--grm)"],["Unrealised Gain",invR-invC,"var(--am)"]] as [string,number,string][]).map(([l,v,c]) => (
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px dashed var(--crd)" }}>
                <span style={{ fontSize:13 }}>{l}</span>
                <span style={{ fontFamily:"Space Mono",fontSize:13,fontWeight:700,color:c }}>{fmt(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
