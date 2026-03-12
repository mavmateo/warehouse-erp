import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbDelete } from "@/lib/api";
import { today, fmt } from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@erp/types";

const CATS: ExpenseCategory[] = ["Rent","Utilities","Wages","Transport","Stock Purchase","Maintenance","Marketing","Other"];

type RangePreset = "this_month" | "last_month" | "last_7" | "last_30" | "custom";

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

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "this_month", label: "This Month"  },
  { id: "last_month", label: "Last Month"  },
  { id: "last_7",     label: "Last 7 Days" },
  { id: "last_30",    label: "Last 30 Days"},
  { id: "custom",     label: "Custom"      },
];

export function Expenses({ onRefresh }: { onRefresh: () => void }) {
  const now = new Date();

  // ── Date range state ─────────────────────────────────────────────────────
  const [preset,   setPreset]   = useState<RangePreset>("this_month");
  const [dateFrom, setDateFrom] = useState(startOfMonth(now));
  const [dateTo,   setDateTo]   = useState(endOfMonth(now));

  // ── Filter state ─────────────────────────────────────────────────────────
  const [descSearch, setDescSearch] = useState("");
  const [catFilter,  setCatFilter]  = useState<ExpenseCategory | "All">("All");

  // ── Data state ───────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState({ expense_date: today(), description: "", amount: "", category: "Rent" as ExpenseCategory });
  const [saving,   setSaving]   = useState(false);

  // ── Preset application ───────────────────────────────────────────────────
  const applyPreset = useCallback((p: RangePreset) => {
    setPreset(p);
    const n = new Date();
    if (p === "this_month") { setDateFrom(startOfMonth(n));                            setDateTo(endOfMonth(n));   }
    if (p === "last_month") { const lm = new Date(n.getFullYear(), n.getMonth()-1, 1); setDateFrom(startOfMonth(lm)); setDateTo(endOfMonth(lm)); }
    if (p === "last_7")     { setDateFrom(daysAgo(6));  setDateTo(new Date().toISOString().split("T")[0]); }
    if (p === "last_30")    { setDateFrom(daysAgo(29)); setDateTo(new Date().toISOString().split("T")[0]); }
  }, []);

  // ── Fetch when date range changes ────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    dbGet<Expense[]>(`/expenses?expense_date=gte.${dateFrom}&expense_date=lte.${dateTo}&order=expense_date.desc`)
      .then((rows) => { setExpenses(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // ── Client-side filtering ────────────────────────────────────────────────
  const filtered = expenses.filter((e) => {
    const descMatch = !descSearch || e.description.toLowerCase().includes(descSearch.toLowerCase());
    const catMatch  = catFilter === "All" || e.category === catFilter;
    return descMatch && catMatch;
  });

  const total = filtered.reduce((a, e) => a + +e.amount, 0);

  // Category breakdown reflects only the filtered set
  const catTotals = CATS
    .map((c) => ({ cat: c, total: filtered.filter((e) => e.category === c).reduce((a, e) => a + +e.amount, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const largest  = catTotals[0]?.total ?? 1;
  const avgExp   = filtered.length ? total / filtered.length : 0;
  const suppExp  = filtered.filter((e) => e.category === "Stock Purchase").reduce((a, e) => a + +e.amount, 0);

  // ── Save new expense ─────────────────────────────────────────────────────
  const save = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    await dbPost("/expenses", { ...form, amount: +form.amount });
    load(); onRefresh();
    setForm({ expense_date: today(), description: "", amount: "", category: "Rent" });
    setSaving(false); setModal(false);
  };

  return (
    <div className="fade-up">

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Expenses</h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>
            {dateFrom} → {dateTo} · {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn bp" onClick={() => setModal(true)}>+ Record Expense</button>
      </div>

      {/* ── Preset pills ── */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p.id)}
            style={{ padding:"6px 16px", borderRadius:20, border:"1.5px solid", fontSize:13, fontWeight:600, cursor:"pointer", transition:"all .15s",
              borderColor: preset === p.id ? "var(--am)" : "var(--crd)",
              background:  preset === p.id ? "var(--am)" : "transparent",
              color:       preset === p.id ? "white"     : "var(--mu)",
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.6fr 1fr", gap:12, marginBottom:20, background:"var(--wh)", borderRadius:14, padding:"16px 20px", boxShadow:"var(--sh)" }}>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreset("custom"); }} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>To</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPreset("custom"); }} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>Description</label>
          <input type="text" placeholder="Search expenses…" value={descSearch} onChange={(e) => setDescSearch(e.target.value)} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>Category</label>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as ExpenseCategory | "All")}>
            <option value="All">All</option>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Total Spent",    value: fmt(total),     sub:`${filtered.length} records`,                        icon:"💸", color:"var(--rd)"  },
          { label:"Average Expense",value: fmt(avgExp),    sub:"per record",                                        icon:"📊", color:"var(--am)"  },
          { label:"Stock Purchases",value: fmt(suppExp),   sub:`${total ? ((suppExp/total)*100).toFixed(0) : 0}% of total`, icon:"🧺", color:"var(--grm)" },
          { label:"Categories",     value: catTotals.length, sub:"with spend this period",                          icon:"🗂", color:"var(--gd)"  },
        ].map((s, i) => (
          <div key={i} style={{ background:"var(--wh)", borderRadius:14, padding:"16px 20px", boxShadow:"var(--sh)", borderTop:`4px solid ${s.color}` }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"Space Mono", color:s.color }}>{s.value}</div>
            <div style={{ fontSize:12, color:"var(--mu)", marginTop:2 }}>{s.label}</div>
            <div style={{ fontSize:11, color:"var(--mu)", marginTop:1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Main content: table + category sidebar ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:20 }}>

        {/* Table */}
        <div style={{ background:"var(--wh)", borderRadius:16, boxShadow:"var(--sh)", overflow:"hidden" }}>
          {loading ? (
            <div style={{ display:"flex", justifyContent:"center", padding:48 }}>
              <div style={{ width:22, height:22, border:"2px solid var(--crd)", borderTop:"2px solid var(--am)", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:"center", padding:"52px 0", color:"var(--mu)" }}>
              <div style={{ fontSize:40, marginBottom:10 }}>💸</div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>No expenses found</div>
              <div style={{ fontSize:13 }}>Try a different date range or clear the filters</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={{ color:"var(--mu)", fontSize:13, whiteSpace:"nowrap" }}>
                      {new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GH", { day:"numeric", month:"short", year:"numeric" })}
                    </td>
                    <td style={{ fontWeight:500 }}>
                      {e.description}
                      {(e as Expense & { supplier_id?: number }).supplier_id && (
                        <span style={{ marginLeft:8, fontSize:10, background:"#EEF2FF", color:"#4338CA", padding:"2px 7px", borderRadius:10, fontWeight:600 }}>🔗 supplier</span>
                      )}
                    </td>
                    <td><span className="badge ba">{e.category}</span></td>
                    <td style={{ fontFamily:"Space Mono", fontWeight:700, color:"var(--rd)", whiteSpace:"nowrap" }}>{fmt(e.amount)}</td>
                    <td>
                      {(e as Expense & { supplier_id?: number }).supplier_id
                        ? <span style={{ fontSize:11, color:"var(--mu)", fontStyle:"italic" }}>auto</span>
                        : <button className="btn bs" style={{ background:"#FEE2E2", color:"var(--rd)", border:"none" }}
                            onClick={async () => { await dbDelete(`/expenses?id=eq.${e.id}`); load(); onRefresh(); }}>×</button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Category breakdown sidebar — updates with filters */}
        <div style={{ background:"var(--wh)", borderRadius:16, padding:20, boxShadow:"var(--sh)", alignSelf:"start" }}>
          <h4 style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--gr)", marginBottom:16 }}>By Category</h4>
          {catTotals.length === 0
            ? <p style={{ fontSize:13, color:"var(--mu)", fontStyle:"italic" }}>No data for this period</p>
            : catTotals.map(({ cat, total: t }) => (
              <div key={cat} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600 }}>{cat}</span>
                  <span style={{ fontFamily:"Space Mono", fontSize:12, color:"var(--rd)", fontWeight:700 }}>{fmt(t)}</span>
                </div>
                <div style={{ background:"var(--crd)", borderRadius:4, height:6 }}>
                  <div style={{ background:"var(--am)", height:"100%", borderRadius:4, width:`${(t / largest) * 100}%`, transition:"width .5s" }} />
                </div>
                <div style={{ fontSize:10, color:"var(--mu)", marginTop:2 }}>{total ? ((t/total)*100).toFixed(0) : 0}% of period total</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Footer total bar ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, padding:"12px 20px", background:"#7F1D1D", borderRadius:12, color:"white" }}>
          <span style={{ fontSize:13, opacity:.7 }}>{filtered.length} expense{filtered.length !== 1 ? "s" : ""} in selected period</span>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:13, opacity:.7 }}>Period Total</span>
            <span style={{ fontFamily:"Space Mono", fontSize:20, fontWeight:700, color:"#FCA5A5" }}>{fmt(total)}</span>
          </div>
        </div>
      )}

      {/* ── Add expense modal ── */}
      {modal && (
        <Modal title="Record Expense" onClose={() => setModal(false)}>
          <Field label="Date"><input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
          <Field label="Description"><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. ECG Electricity Bill" /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (GH₵)"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button className="btn bp" onClick={save} style={{ flex:1, justifyContent:"center" }} disabled={saving}>{saving ? <Spin /> : "Save"}</button>
            <button className="btn bgh" onClick={() => setModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
