import { useState, useEffect, useCallback } from "react";
import { dbGet } from "@/lib/api";
import { fmt } from "@/lib/utils";

interface Sale {
  id:             number;
  sale_date:      string;
  customer:       string | null;
  customer_id:    number | null;
  payment_method: string;
  total:          string | number;
}

interface SaleItem {
  sale_id:      number;
  product_name: string;
  quantity:     number;
  unit_price:   string | number;
}

type RangePreset = "this_month" | "last_month" | "last_7" | "last_30" | "custom";

const PAY_CLASS: Record<string, string> = {
  Cash: "bg", MoMo: "ba", "Bank Transfer": "bb", Credit: "br",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
const todayStr = () => new Date().toISOString().split("T")[0];

export function Sales({ onGoToPOS }: { onGoToPOS: () => void }) {
  const now = new Date();

  const [sales,     setSales]     = useState<Sale[]>([]);
  const [items,     setItems]     = useState<SaleItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<number | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [preset,    setPreset]    = useState<RangePreset>("this_month");
  const [dateFrom,  setDateFrom]  = useState(startOfMonth(now));
  const [dateTo,    setDateTo]    = useState(endOfMonth(now));
  const [custSearch, setCustSearch] = useState("");
  const [payFilter,  setPayFilter]  = useState("All");

  // Apply a preset (updates dateFrom/dateTo)
  const applyPreset = useCallback((p: RangePreset) => {
    setPreset(p);
    const n = new Date();
    if (p === "this_month")  { setDateFrom(startOfMonth(n)); setDateTo(endOfMonth(n)); }
    if (p === "last_month")  { const lm = new Date(n.getFullYear(), n.getMonth()-1,1); setDateFrom(startOfMonth(lm)); setDateTo(endOfMonth(lm)); }
    if (p === "last_7")      { setDateFrom(daysAgo(6));   setDateTo(todayStr()); }
    if (p === "last_30")     { setDateFrom(daysAgo(29));  setDateTo(todayStr()); }
  }, []);

  // Fetch whenever date range changes
  useEffect(() => {
    setLoading(true);
    Promise.all([
      dbGet<Sale[]>(`/sales?sale_date=gte.${dateFrom}&sale_date=lte.${dateTo}&order=sale_date.desc,id.desc`),
      dbGet<SaleItem[]>(`/sale_items?select=sale_id,product_name,quantity,unit_price`),
    ]).then(([s, i]) => { setSales(s); setItems(i); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo]);

  // ── Derived / filtered list ───────────────────────────────────────────────
  const filtered = sales.filter((s) => {
    const custMatch = !custSearch || (s.customer ?? "Walk-in").toLowerCase().includes(custSearch.toLowerCase());
    const payMatch  = payFilter === "All" || s.payment_method === payFilter;
    return custMatch && payMatch;
  });

  const totalRev   = filtered.reduce((a, s) => a + +s.total, 0);
  const avgSale    = filtered.length ? totalRev / filtered.length : 0;
  const cashCount  = filtered.filter((s) => s.payment_method === "Cash").length;
  const momoCount  = filtered.filter((s) => s.payment_method === "MoMo").length;

  const saleItems  = (saleId: number) => items.filter((i) => i.sale_id === saleId);

  // ── Preset label ─────────────────────────────────────────────────────────
  const presets: { id: RangePreset; label: string }[] = [
    { id: "this_month",  label: "This Month" },
    { id: "last_month",  label: "Last Month" },
    { id: "last_7",      label: "Last 7 Days" },
    { id: "last_30",     label: "Last 30 Days" },
    { id: "custom",      label: "Custom" },
  ];

  return (
    <div className="fade-up">

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Sales History</h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>
            {dateFrom} → {dateTo} · {filtered.length} sale{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn bp" onClick={onGoToPOS}>+ New Sale</button>
      </div>

      {/* ── Preset pills ── */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {presets.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p.id)}
            style={{ padding:"6px 16px", borderRadius:20, border:"1.5px solid", fontSize:13, fontWeight:600, cursor:"pointer", transition:"all .15s",
              borderColor: preset === p.id ? "var(--am)" : "var(--crd)",
              background:  preset === p.id ? "var(--am)" : "transparent",
              color:       preset === p.id ? "white" : "var(--mu)",
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Custom date range + search filters ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.6fr 1fr", gap:12, marginBottom:20, background:"var(--wh)", borderRadius:14, padding:"16px 20px", boxShadow:"var(--sh)" }}>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>From</label>
          <input type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreset("custom"); }}
          />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>To</label>
          <input type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreset("custom"); }}
          />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>Customer</label>
          <input type="text" placeholder="Search by customer name…"
            value={custSearch} onChange={(e) => setCustSearch(e.target.value)}
          />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>Payment</label>
          <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
            {["All","Cash","MoMo","Bank Transfer","Credit"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Revenue",     value: fmt(totalRev),          sub:`${filtered.length} transactions`, icon:"💰", color:"var(--am)" },
          { label:"Average Sale", value: fmt(avgSale),           sub:"per transaction",                icon:"📊", color:"var(--grm)" },
          { label:"Cash Sales",   value: cashCount,              sub:`${filtered.length ? ((cashCount/filtered.length)*100).toFixed(0) : 0}% of sales`, icon:"🪙", color:"var(--gd)" },
          { label:"MoMo Sales",   value: momoCount,              sub:`${filtered.length ? ((momoCount/filtered.length)*100).toFixed(0) : 0}% of sales`, icon:"📱", color:"#8B5CF6" },
        ].map((s, i) => (
          <div key={i} style={{ background:"var(--wh)", borderRadius:14, padding:"16px 20px", boxShadow:"var(--sh)", borderTop:`4px solid ${s.color}` }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"Space Mono", color:s.color }}>{s.value}</div>
            <div style={{ fontSize:12, color:"var(--mu)", marginTop:2 }}>{s.label}</div>
            <div style={{ fontSize:11, color:"var(--mu)", marginTop:1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={{ background:"var(--wh)", borderRadius:16, boxShadow:"var(--sh)", overflow:"hidden" }}>
        {loading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:48 }}>
            <div style={{ width:22, height:22, border:"2px solid var(--crd)", borderTop:"2px solid var(--am)", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"52px 0", color:"var(--mu)" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🧾</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>No sales found</div>
            <div style={{ fontSize:13 }}>Try a different date range or clear the filters</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width:32 }}></th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const si       = saleItems(s.id);
                const isOpen   = expanded === s.id;
                const itemSummary = si.slice(0, 2).map((i) => `${i.quantity > 1 ? i.quantity + "× " : ""}${i.product_name}`).join(", ")
                  + (si.length > 2 ? ` +${si.length - 2} more` : "");

                return (
                  <>
                    <tr key={s.id}
                      onClick={() => setExpanded(isOpen ? null : s.id)}
                      style={{ cursor:"pointer" }}>

                      {/* Expand toggle */}
                      <td style={{ paddingRight:4 }}>
                        <div style={{ width:22, height:22, borderRadius:6, background: isOpen ? "var(--am)" : "var(--cr)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color: isOpen ? "white" : "var(--mu)", fontWeight:700, transition:"all .15s" }}>
                          {isOpen ? "▲" : "▼"}
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ color:"var(--mu)", fontSize:13, whiteSpace:"nowrap" }}>
                        {new Date(s.sale_date + "T00:00:00").toLocaleDateString("en-GH", { day:"numeric", month:"short", year:"numeric" })}
                      </td>

                      {/* Customer */}
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {s.customer_id ? (
                            <div style={{ width:26, height:26, borderRadius:"50%", background:`hsl(${((s.customer ?? "A").charCodeAt(0)*47)%360},55%,62%)`, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:11, flexShrink:0 }}>
                              {(s.customer ?? "?").charAt(0).toUpperCase()}
                            </div>
                          ) : (
                            <div style={{ width:26, height:26, borderRadius:"50%", background:"var(--crd)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>👤</div>
                          )}
                          <span style={{ fontWeight: s.customer_id ? 600 : 400, fontSize:14, color: s.customer_id ? "var(--tx)" : "var(--mu)", fontStyle: s.customer_id ? "normal" : "italic" }}>
                            {s.customer ?? "Walk-in"}
                          </span>
                        </div>
                      </td>

                      {/* Item summary */}
                      <td style={{ fontSize:13, color:"var(--mu)", maxWidth:220, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {si.length === 0 ? "—" : itemSummary}
                      </td>

                      {/* Payment */}
                      <td>
                        <span className={`badge ${PAY_CLASS[s.payment_method] ?? "bb"}`}>{s.payment_method}</span>
                      </td>

                      {/* Total */}
                      <td style={{ fontFamily:"Space Mono", fontWeight:700, color:"var(--grm)", fontSize:14, whiteSpace:"nowrap" }}>
                        {fmt(s.total)}
                      </td>
                    </tr>

                    {/* Expanded items row */}
                    {isOpen && (
                      <tr key={`${s.id}-exp`}>
                        <td colSpan={6} style={{ padding:0, background:"var(--cr)" }}>
                          <div style={{ padding:"12px 20px 14px 60px" }}>
                            <div style={{ fontSize:11, fontWeight:700, color:"var(--mu)", textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Items Sold</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                              {si.length === 0 && <span style={{ fontSize:13, color:"var(--mu)", fontStyle:"italic" }}>No items recorded</span>}
                              {si.map((item, idx) => (
                                <div key={idx} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--wh)", borderRadius:8, padding:"8px 12px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                                  <span style={{ fontSize:16 }}>🧺</span>
                                  <span style={{ fontWeight:600, fontSize:13, flex:1 }}>{item.product_name}</span>
                                  <span style={{ fontSize:12, color:"var(--mu)", marginRight:8 }}>×{item.quantity}</span>
                                  <span style={{ fontFamily:"Space Mono", fontSize:13, color:"var(--am)", fontWeight:700 }}>{fmt(+item.unit_price)}</span>
                                  <span style={{ fontFamily:"Space Mono", fontSize:12, color:"var(--grm)", fontWeight:700, minWidth:70, textAlign:"right" }}>{fmt(+item.unit_price * item.quantity)}</span>
                                </div>
                              ))}
                            </div>
                            {/* Sale subtotal */}
                            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10, paddingTop:8, borderTop:"1px dashed var(--crd)" }}>
                              <span style={{ fontSize:13, color:"var(--mu)", marginRight:16 }}>Sale Total</span>
                              <span style={{ fontFamily:"Space Mono", fontWeight:700, fontSize:15, color:"var(--gr)" }}>{fmt(s.total)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer total bar */}
      {!loading && filtered.length > 0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, padding:"12px 20px", background:"var(--gr)", borderRadius:12, color:"white" }}>
          <span style={{ fontSize:13, opacity:.7 }}>{filtered.length} sale{filtered.length !== 1 ? "s" : ""} in selected period</span>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:13, opacity:.7 }}>Period Revenue</span>
            <span style={{ fontFamily:"Space Mono", fontSize:20, fontWeight:700, color:"var(--gd)" }}>{fmt(totalRev)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
