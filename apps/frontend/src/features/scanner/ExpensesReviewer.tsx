import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbPost } from "@/lib/api";
import { fmt } from "@/lib/utils";
import type { ParsedExpenses, ParsedExpense } from "./types";
import { ReviewSidebar, DoneScreen } from "./shared";

const CATEGORIES = ["Rent","Utilities","Wages","Transport","Stock Purchase","Maintenance","Marketing","Other"];

interface Props { raw: Record<string, unknown>; ocrText: string; preview: string; onReset: () => void; onSaved: () => void; }

export function ExpensesReviewer({ raw, ocrText, preview, onReset, onSaved }: Props) {
  const [data,   setData]   = useState<ParsedExpenses>(raw as unknown as ParsedExpenses);
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  if (done) return <DoneScreen message={`${data.expenses.length} expense record${data.expenses.length !== 1 ? "s" : ""} saved successfully.`} onAnother={onReset} />;

  const setExp = (i: number, patch: Partial<ParsedExpense>) =>
    setData((d) => { const expenses = [...d.expenses]; expenses[i] = { ...expenses[i], ...patch }; return { ...d, expenses }; });

  const addExp = () =>
    setData((d) => ({ ...d, expenses: [...d.expenses, { expense_date: new Date().toISOString().split("T")[0], description:"", amount:0, category:"Other" }] }));

  const removeExp = (i: number) =>
    setData((d) => ({ ...d, expenses: d.expenses.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!data.expenses.length) return;
    setSaving(true); setError(null);
    try {
      await Promise.all(data.expenses.map((e) => dbPost("/expenses", { expense_date: e.expense_date, description: e.description, amount: +e.amount, category: e.category })));
      onSaved(); setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const total = data.expenses.reduce((a, e) => a + +e.amount, 0);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:20 }}>
      <ReviewSidebar preview={preview} confidence={data.confidence} notes={data.notes} ocrText={ocrText} />

      <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)", display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontFamily:"Playfair Display", fontSize:20, color:"var(--gr)" }}>💸 Review Expenses</h3>
          <button onClick={addExp} className="btn bgh" style={{ fontSize:12, padding:"6px 14px" }}>+ Add Row</button>
        </div>
        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", fontSize:13, color:"var(--rd)" }}>⚠️ {error}</div>}

        <div style={{ border:"1px solid var(--crd)", borderRadius:12, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"var(--cr)" }}>
              {["Date","Description","Category","Amount",""].map((h) => (
                <th key={h} style={{ padding:"8px 12px", fontSize:11, textAlign: h === "Amount" ? "right" : "left", fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.expenses.map((e, i) => (
                <tr key={i} style={{ borderTop:"1px solid var(--crd)" }}>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="date" value={e.expense_date} onChange={(ev) => setExp(i, { expense_date: ev.target.value })}
                      style={{ fontSize:13, padding:"4px 8px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="text" value={e.description} onChange={(ev) => setExp(i, { description: ev.target.value })}
                      style={{ width:"100%", fontSize:13, padding:"4px 8px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <select value={e.category} onChange={(ev) => setExp(i, { category: ev.target.value })}
                      style={{ fontSize:12, padding:"4px 8px", borderRadius:6, border:"1px solid var(--crd)" }}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="number" min="0" step="0.01" value={e.amount} onChange={(ev) => setExp(i, { amount: +ev.target.value })}
                      style={{ width:100, textAlign:"right", fontSize:13, padding:"4px 8px", borderRadius:6, border:"1px solid var(--crd)", fontFamily:"Space Mono" }}/>
                  </td>
                  <td style={{ padding:"8px 8px" }}>
                    <button onClick={() => removeExp(i)} style={{ width:26, height:26, borderRadius:6, border:"none", background:"#FEE2E2", color:"var(--rd)", cursor:"pointer", fontSize:14 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:12, borderTop:"1px solid var(--crd)" }}>
          <div>
            <div style={{ fontSize:11, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>Total</div>
            <div style={{ fontFamily:"Space Mono", fontSize:24, fontWeight:700, color:"var(--rd)" }}>{fmt(total)}</div>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn bgh" onClick={onReset}>Cancel</button>
            <button className="btn bp" onClick={save} disabled={saving || data.expenses.length === 0} style={{ minWidth:180, justifyContent:"center" }}>
              {saving ? <><Spin/> Saving…</> : `✓ Save ${data.expenses.length} Expense${data.expenses.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
