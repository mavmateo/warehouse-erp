import { useState, useEffect } from "react";
import { Spin } from "@/components/ui/Spin";
import { dbGet, dbPost } from "@/lib/api";
import type { ParsedCustomers, ParsedCustomer } from "./types";
import { ReviewSidebar, DoneScreen } from "./shared";

interface ExistingCustomer { id: number; name: string; phone: string | null; }

interface Props { raw: Record<string, unknown>; ocrText: string; preview: string; onReset: () => void; onSaved: () => void; }

export function CustomersReviewer({ raw, ocrText, preview, onReset, onSaved }: Props) {
  const [data,   setData]   = useState<ParsedCustomers | null>(null);
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    dbGet<ExistingCustomer[]>("/customers?select=id,name,phone&order=name").then((existing) => {
      const parsed = raw as unknown as ParsedCustomers;
      const norm = (s: string) => s.toLowerCase().trim();
      const customers: ParsedCustomer[] = parsed.customers.map((c) => ({
        ...c,
        exists: existing.some((e) => norm(e.name) === norm(c.name)),
      }));
      setData({ ...parsed, customers });
    });
  }, []);

  if (!data) return <div style={{ padding:40, textAlign:"center", color:"var(--mu)" }}>Loading…</div>;
  if (done) return <DoneScreen message={`${data.customers.filter((c) => !c.exists).length} new customer${data.customers.filter((c) => !c.exists).length !== 1 ? "s" : ""} added to your database.`} onAnother={onReset} />;

  const setCust = (i: number, patch: Partial<ParsedCustomer>) =>
    setData((d) => { if (!d) return d; const customers = [...d.customers]; customers[i] = { ...customers[i], ...patch }; return { ...d, customers }; });

  const addCust = () =>
    setData((d) => d ? { ...d, customers: [...d.customers, { name:"", phone:null, location:null, notes:null, exists:false }] } : d);

  const removeCust = (i: number) =>
    setData((d) => d ? { ...d, customers: d.customers.filter((_, idx) => idx !== i) } : d);

  const newCustomers = data.customers.filter((c) => !c.exists);

  const save = async () => {
    if (!newCustomers.length) return;
    setSaving(true); setError(null);
    try {
      await Promise.all(newCustomers.map((c) =>
        dbPost("/customers", { name: c.name, phone: c.phone || null, location: c.location || null, notes: c.notes || null }),
      ));
      onSaved(); setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:20 }}>
      <ReviewSidebar preview={preview} confidence={data.confidence} notes={data.notes} ocrText={ocrText} />

      <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)", display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontFamily:"Playfair Display", fontSize:20, color:"var(--gr)" }}>👥 Review Customers</h3>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {newCustomers.length > 0 && <span style={{ fontSize:12, background:"#D1FAE5", color:"#065F46", padding:"3px 10px", borderRadius:10, fontWeight:600 }}>+{newCustomers.length} new</span>}
            {data.customers.length - newCustomers.length > 0 && <span style={{ fontSize:12, background:"#FEF9C3", color:"#92400E", padding:"3px 10px", borderRadius:10, fontWeight:600 }}>{data.customers.length - newCustomers.length} already exist</span>}
            <button onClick={addCust} className="btn bgh" style={{ fontSize:12, padding:"6px 14px" }}>+ Add</button>
          </div>
        </div>
        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", fontSize:13, color:"var(--rd)" }}>⚠️ {error}</div>}

        <div style={{ border:"1px solid var(--crd)", borderRadius:12, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"var(--cr)" }}>
              {["Status","Name","Phone","Location","Notes",""].map((h) => (
                <th key={h} style={{ padding:"8px 12px", fontSize:11, textAlign:"left", fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.customers.map((c, i) => (
                <tr key={i} style={{ borderTop:"1px solid var(--crd)", background: c.exists ? "#FFFBEB" : "white" }}>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:8, background: c.exists ? "#FEF9C3" : "#D1FAE5", color: c.exists ? "#92400E" : "#065F46" }}>
                      {c.exists ? "⟳ Exists" : "+ New"}
                    </span>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:"50%", background:`hsl(${(c.name.charCodeAt(0)*47)%360},55%,62%)`, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:12, flexShrink:0 }}>
                        {c.name ? c.name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <input type="text" value={c.name} onChange={(e) => setCust(i, { name: e.target.value })} style={{ flex:1, fontSize:13, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                    </div>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="text" value={c.phone ?? ""} onChange={(e) => setCust(i, { phone: e.target.value || null })} placeholder="0244…" style={{ width:130, fontSize:13, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="text" value={c.location ?? ""} onChange={(e) => setCust(i, { location: e.target.value || null })} placeholder="Accra…" style={{ width:120, fontSize:13, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="text" value={c.notes ?? ""} onChange={(e) => setCust(i, { notes: e.target.value || null })} style={{ width:160, fontSize:12, padding:"3px 7px", borderRadius:6, border:"1px solid var(--crd)" }}/>
                  </td>
                  <td style={{ padding:"8px 8px" }}>
                    <button onClick={() => removeCust(i)} style={{ width:26, height:26, borderRadius:6, border:"none", background:"#FEE2E2", color:"var(--rd)", cursor:"pointer", fontSize:14 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.customers.some((c) => c.exists) && (
          <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#92400E" }}>
            ⚠️ Customers marked "Exists" are already in your database and will be skipped.
          </div>
        )}

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:12, borderTop:"1px solid var(--crd)" }}>
          <div style={{ fontSize:13, color:"var(--mu)" }}>
            {newCustomers.length > 0
              ? `${newCustomers.length} new customer${newCustomers.length !== 1 ? "s" : ""} will be added`
              : "All detected customers already exist in the database"}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn bgh" onClick={onReset}>Cancel</button>
            <button className="btn bp" onClick={save} disabled={saving || newCustomers.length === 0} style={{ minWidth:180, justifyContent:"center" }}>
              {saving ? <><Spin/> Saving…</> : `✓ Add ${newCustomers.length} Customer${newCustomers.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
