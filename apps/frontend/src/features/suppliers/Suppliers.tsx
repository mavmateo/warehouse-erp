import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch } from "@/lib/api";
import { today, fmt } from "@/lib/utils";
import type { Supplier, Product } from "@erp/types";

export function Suppliers({ onRefresh }: { onRefresh: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products,  setProducts]  = useState<Pick<Product,"id"|"name"|"supplier">[]>([]);
  const [modal,  setModal]  = useState<"add"|"edit"|null>(null);
  const [form,   setForm]   = useState<Partial<Supplier>>({});
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([
      dbGet<Supplier[]>("/suppliers?order=name"),
      dbGet<Pick<Product,"id"|"name"|"supplier">[]>("/products?select=id,name,supplier"),
    ]).then(([s, p]) => { setSuppliers(s); setProducts(p); });

  useEffect(() => { void load(); }, []);

  const totalOwed = suppliers.reduce((a, s) => a + +s.balance, 0);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    const body = { name: form.name, phone: form.phone, address: form.address, balance: +(form.balance ?? 0), last_order: form.last_order };
    if (modal === "add") await dbPost("/suppliers", body);
    else await dbPatch(`/suppliers?id=eq.${form.id}`, body);
    load(); onRefresh(); setSaving(false); setModal(null);
  };

  return (
    <div className="fade-up">
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display",fontSize:26,color:"var(--gr)" }}>Suppliers</h2>
          <p style={{ color:"var(--mu)",fontSize:13 }}>Total owed: <strong style={{ color:totalOwed>0?"var(--rd)":"var(--grm)" }}>{fmt(totalOwed)}</strong></p>
        </div>
        <button className="btn bp" onClick={() => { setForm({ balance:0, last_order:today() }); setModal("add"); }}>+ Add Supplier</button>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16 }}>
        {suppliers.map((s) => {
          const items = products.filter((p) => p.supplier === s.name);
          return (
            <div key={s.id} style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)",borderTop:`4px solid ${+s.balance>0?"var(--rd)":"var(--grm)"}` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
                <div>
                  <div style={{ fontWeight:700,fontSize:15,color:"var(--gr)" }}>{s.name}</div>
                  <div style={{ fontSize:12,color:"var(--mu)",marginTop:3 }}>📞 {s.phone}</div>
                </div>
                <span className={`badge ${+s.balance>0?"br":"bg"}`}>{+s.balance>0?`Owes ${fmt(s.balance)}`:"Settled"}</span>
              </div>
              <div style={{ fontSize:12,color:"var(--mu)",marginBottom:8 }}>📍 {s.address}</div>
              <div style={{ fontSize:12,color:"var(--mu)",marginBottom:12 }}>Last order: {s.last_order} · {items.length} type(s)</div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:12 }}>
                {items.slice(0,3).map((p) => <span key={p.id} className="badge bb" style={{ fontSize:10 }}>{p.name.split(" ").slice(0,2).join(" ")}</span>)}
                {items.length>3 && <span className="badge bb" style={{ fontSize:10 }}>+{items.length-3} more</span>}
              </div>
              <button className="btn bgh bs" style={{ width:"100%",justifyContent:"center" }} onClick={() => { setForm({ ...s }); setModal("edit"); }}>✏ Edit</button>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal title={modal==="add"?"Add Supplier":"Edit Supplier"} onClose={() => setModal(null)}>
          <Field label="Name"><input type="text" value={form.name??""} onChange={(e)=>setForm({...form,name:e.target.value})} /></Field>
          <Field label="Phone"><input type="text" value={form.phone??""} onChange={(e)=>setForm({...form,phone:e.target.value})} /></Field>
          <Field label="Address"><input type="text" value={form.address??""} onChange={(e)=>setForm({...form,address:e.target.value})} /></Field>
          <Field label="Outstanding Balance (GH₵)"><input type="number" value={form.balance??0} onChange={(e)=>setForm({...form,balance:+e.target.value})} /></Field>
          <Field label="Last Order Date"><input type="date" value={form.last_order??today()} onChange={(e)=>setForm({...form,last_order:e.target.value})} /></Field>
          <div style={{ display:"flex",gap:10,marginTop:20 }}>
            <button className="btn bp" onClick={save} style={{ flex:1,justifyContent:"center" }} disabled={saving}>{saving?<Spin/>:"Save"}</button>
            <button className="btn bgh" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
