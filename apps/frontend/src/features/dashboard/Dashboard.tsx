import { useState, useEffect, useCallback } from "react";
import { dbGet } from "@/lib/api";
import { today, fmt } from "@/lib/utils";
import type { Product, Sale, SaleItem, Expense, SaleWithItems } from "@erp/types";

interface DashboardData {
  products:     Product[];
  recentSales:  SaleWithItems[];
  todaySales:   Sale[];
  wkSales:      Sale[];
  totalRev:     number;
  totalExp:     number;
  gross:        number;
}

export function Dashboard({ reload }: { reload: number }) {
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    const [products, allSales, allItems, expenses] = await Promise.all([
      dbGet<Product[]>("/products?order=name"),
      dbGet<Sale[]>("/sales?order=sale_date.desc"),
      dbGet<SaleItem[]>("/sale_items?select=*"),
      dbGet<Expense[]>("/expenses?order=expense_date.desc"),
    ]);
    const recent: SaleWithItems[] = allSales.slice(0, 5).map((s) => ({
      ...s,
      items: allItems.filter((i) => i.sale_id === s.id),
    }));
    const todaySales = allSales.filter((s) => s.sale_date === today());
    const wkSales    = allSales.filter((s) => (Date.now() - new Date(s.sale_date).getTime()) / 86400000 <= 7);
    const totalRev   = allSales.reduce((a, s) => a + +s.total, 0);
    const totalExp   = expenses.reduce((a, e) => a + +e.amount, 0);
    const cogs       = allSales.reduce((acc, sale) => {
      const si = allItems.filter((i) => i.sale_id === sale.id);
      return acc + si.reduce((a, item) => {
        const p = products.find((x) => x.id === item.product_id);
        return a + (p ? +p.buy_price * item.quantity : 0);
      }, 0);
    }, 0);
    setData({ products, recentSales: recent, todaySales, wkSales, totalRev, totalExp, gross: totalRev - cogs });
  }, []);

  useEffect(() => { void load(); }, [reload, load]);

  if (!data) return null;

  const { products, recentSales, todaySales, wkSales, totalRev, totalExp, gross } = data;
  const lowStock = products.filter((p) => p.stock <= p.reorder_level);

  const stats = [
    { label:"Today's Sales",  value: fmt(todaySales.reduce((a, s) => a + +s.total, 0)), sub:`${todaySales.length} transactions`, icon:"💰", color:"var(--am)" },
    { label:"This Week",      value: fmt(wkSales.reduce((a, s) => a + +s.total, 0)),    sub:`${wkSales.length} sales`,           icon:"📈", color:"var(--grm)" },
    { label:"Gross Profit",   value: fmt(gross),                                         sub:"All time",                          icon:"🏆", color:"var(--gd)" },
    { label:"Low Stock",      value: String(lowStock.length),                            sub:"Need reorder",                      icon:"⚠️", color: lowStock.length > 0 ? "var(--rd)" : "var(--grm)" },
  ];

  return (
    <div className="fade-up">
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontFamily:"Playfair Display", fontSize:30, color:"var(--gr)", marginBottom:4 }}>Akwaaba, Oga! 👋</h2>
        <p style={{ color:"var(--mu)", fontSize:15 }}>{new Date().toLocaleDateString("en-GH", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</p>
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
        {stats.map((c, i) => (
          <div key={i} className="sc" style={{ background:"var(--wh)", borderRadius:16, padding:"20px 22px", boxShadow:"var(--sh)", borderTop:`4px solid ${c.color}` }}>
            <div style={{ fontSize:28, marginBottom:8 }}>{c.icon}</div>
            <div style={{ fontSize:24, fontWeight:700, fontFamily:"Space Mono", color:c.color }}>{c.value}</div>
            <div style={{ fontSize:12, color:"var(--mu)", marginTop:4 }}>{c.label}</div>
            <div style={{ fontSize:11, color:"var(--mu)", marginTop:2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:20 }}>
        {/* Recent sales */}
        <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)" }}>
          <h4 style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--gr)", marginBottom:16 }}>Recent Sales</h4>
          <table>
            <thead><tr><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Date</th></tr></thead>
            <tbody>
              {recentSales.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight:600 }}>{s.customer}</td>
                  <td>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      {s.items.map((item, idx) => (
                        <span key={idx} style={{ fontSize:12, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {item.quantity > 1 && <span style={{ fontWeight:700, color:"var(--am)", marginRight:3 }}>{item.quantity}×</span>}
                          {item.product_name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontWeight:700, color:"var(--grm)", fontFamily:"Space Mono", fontSize:13 }}>{fmt(s.total)}</td>
                  <td><span className={`badge ${s.payment_method==="Cash"?"bg":s.payment_method==="MoMo"?"ba":"bb"}`}>{s.payment_method}</span></td>
                  <td style={{ color:"var(--mu)", fontSize:13 }}>{s.sale_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Low stock + P&L */}
        <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)" }}>
          <h4 style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--rd)", marginBottom:16 }}>⚠ Low Stock Alert</h4>
          {lowStock.length === 0
            ? <div style={{ textAlign:"center", padding:"30px 0", color:"var(--mu)" }}><div style={{ fontSize:36, marginBottom:8 }}>✅</div>All bales well stocked!</div>
            : lowStock.map((p) => (
              <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"#FFF5F5", borderRadius:10, borderLeft:"3px solid var(--rd)", marginBottom:8 }}>
                <div><div style={{ fontWeight:600, fontSize:13 }}>{p.name}</div><div style={{ fontSize:11, color:"var(--mu)" }}>{p.supplier}</div></div>
                <span className="badge br">{p.stock} left</span>
              </div>
            ))
          }
          <div style={{ marginTop:20, paddingTop:16, borderTop:"1px solid var(--crd)" }}>
            <h4 style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--gr)", marginBottom:12 }}>Money Overview</h4>
            {([["Revenue", totalRev, "var(--grm)"], ["Expenses", -totalExp, "var(--rd)"], ["Gross Profit", gross, gross >= 0 ? "var(--am)" : "var(--rd)"]] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px dashed var(--crd)" }}>
                <span style={{ fontSize:13, color:"var(--mu)" }}>{l}</span>
                <span style={{ fontWeight:700, fontFamily:"Space Mono", color:c, fontSize:13 }}>{fmt(Math.abs(v))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
