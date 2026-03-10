import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbDelete } from "@/lib/api";
import { today, fmt } from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@erp/types";

const CATS: ExpenseCategory[] = ["Rent","Utilities","Wages","Transport","Stock Purchase","Maintenance","Marketing","Other"];

export function Expenses({ onRefresh }: { onRefresh: () => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState({ expense_date: today(), description: "", amount: "", category: "Rent" as ExpenseCategory });
  const [saving, setSaving] = useState(false);

  const load = () => dbGet<Expense[]>("/expenses?select=*&order=expense_date.desc").then(setExpenses);
  useEffect(() => { void load(); }, []);

  const total = expenses.reduce((a, e) => a + +e.amount, 0);
  const catTotals = CATS
    .map((c) => ({ cat: c, total: expenses.filter((e) => e.category === c).reduce((a, e) => a + +e.amount, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

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
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display",fontSize:26,color:"var(--gr)" }}>Expenses</h2>
          <p style={{ color:"var(--mu)",fontSize:13 }}>Total: <strong style={{ color:"var(--rd)" }}>{fmt(total)}</strong></p>
        </div>
        <button className="btn bp" onClick={() => setModal(true)}>+ Record Expense</button>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 280px",gap:20 }}>
        <div style={{ background:"var(--wh)",borderRadius:16,boxShadow:"var(--sh)",overflow:"hidden" }}>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {expenses.map(e => (
  <tr key={e.id}>
    <td style={{ color:"var(--mu)",fontSize:13 }}>{e.expense_date}</td>
    <td style={{ fontWeight:500 }}>
      {e.description}
      {e.supplier_id && (
        <span style={{ marginLeft:8, fontSize:10, background:"#EEF2FF", color:"#4338CA", padding:"2px 7px", borderRadius:10, fontWeight:600 }}>
          🔗 supplier
        </span>
      )}
    </td>
    <td><span className="badge ba">{e.category}</span></td>
    <td style={{ fontFamily:"Space Mono",fontWeight:700,color:"var(--rd)" }}>{fmt(e.amount)}</td>
    <td>
      {e.supplier_id
        ? <span style={{ fontSize:11, color:"var(--mu)", fontStyle:"italic" }}>auto-managed</span>
        : <button className="btn bs" style={{ background:"#FEE2E2",color:"var(--rd)",border:"none" }}
            onClick={async()=>{await dbDelete(`/expenses?id=eq.${e.id}`);load();onRefresh();}}>×</button>
      }
    </td>
  </tr>
))}
            </tbody>
          </table>
        </div>

        <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)" }}>
          <h4 style={{ fontFamily:"Playfair Display",fontSize:17,color:"var(--gr)",marginBottom:16 }}>By Category</h4>
          {catTotals.map(({ cat, total: t }) => (
            <div key={cat} style={{ marginBottom:12 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ fontSize:12,fontWeight:600 }}>{cat}</span>
                <span style={{ fontFamily:"Space Mono",fontSize:12,color:"var(--rd)",fontWeight:700 }}>{fmt(t)}</span>
              </div>
              <div style={{ background:"var(--crd)",borderRadius:4,height:6 }}>
                <div style={{ background:"var(--am)",height:"100%",borderRadius:4,width:`${(t/total)*100}%`,transition:"width .5s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

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
          <div style={{ display:"flex",gap:10,marginTop:20 }}>
            <button className="btn bp" onClick={save} style={{ flex:1,justifyContent:"center" }} disabled={saving}>{saving ? <Spin /> : "Save"}</button>
            <button className="btn bgh" onClick={() => setModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
