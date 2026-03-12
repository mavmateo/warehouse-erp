import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch, dbDelete } from "@/lib/api";
import { fmt } from "@/lib/utils";

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface Customer {
  id: number; name: string; phone: string | null;
  location: string | null; notes: string | null; created_at: string | null;
}
interface Sale {
  id: number; customer_id: number | null; customer: string | null;
  total: number; sale_date: string; payment_method: string;
}
interface SaleItem { sale_id: number; product_name: string; quantity: number; }
interface CustomerRow extends Customer {
  totalSales: number; totalSpent: number;
  topItem: string | null; lastSaleDate: string | null; payMethods: string[];
}
interface SendResult {
  recipient: string; phone: string; channel: string;
  success: boolean; sid?: string; error?: string;
}

type FormState = Partial<Customer>;
type Channel   = "sms" | "whatsapp" | "both";
type ModalType = "add" | "edit" | "view" | "message" | null;

const TEMPLATES = [
  { label: "New Stock Arrival",
    body: "Hi {name}! 👋 New bales just arrived at BaleShop GH. Come in early for the best picks! 🧺 — BaleShop GH, Kantamanto" },
  { label: "Special Discount",
    body: "Hello {name}! 🎉 We're running a special discount on selected bales this week. Don't miss out! — BaleShop GH" },
  { label: "Thank You",
    body: "Dear {name}, thank you for shopping with us! We appreciate your business and look forward to seeing you again. 🙏 — BaleShop GH" },
  { label: "Seasonal Promo",
    body: "Hi {name}! New season bales are in — Bedding, Children & Women categories fully restocked. Visit us today! 🧺 — BaleShop GH" },
  { label: "Custom", body: "" },
];

export function Customers({ onRefresh }: { onRefresh: () => void }) {
  const [rows,    setRows]    = useState<CustomerRow[]>([]);
  const [modal,   setModal]   = useState<ModalType>(null);
  const [form,    setForm]    = useState<FormState>({});
  const [viewing, setViewing] = useState<CustomerRow | null>(null);
  const [search,  setSearch]  = useState("");
  const [saving,  setSaving]  = useState(false);

  // ── Messaging state ───────────────────────────────────────────────────────
  const [msgChannel,  setMsgChannel]  = useState<Channel>("sms");
  const [tplIdx,      setTplIdx]      = useState(0);
  const [msgBody,     setMsgBody]     = useState(TEMPLATES[0].body);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sending,     setSending]     = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);

  // ── Data load ─────────────────────────────────────────────────────────────
  const load = async () => {
    const [customers, sales, items] = await Promise.all([
      dbGet<Customer[]>("/customers?order=name"),
      dbGet<Sale[]>("/sales?select=id,customer_id,customer,total,sale_date,payment_method"),
      dbGet<SaleItem[]>("/sale_items?select=sale_id,product_name,quantity"),
    ]);
    const enriched: CustomerRow[] = customers.map((c) => {
      const cSales = sales.filter((s) => s.customer_id === c.id);
      const totalSales = cSales.length;
      const totalSpent = cSales.reduce((a, s) => a + +s.total, 0);
      const lastSaleDate = cSales.length
        ? [...cSales].sort((a, b) => b.sale_date.localeCompare(a.sale_date))[0].sale_date : null;
      const saleIds = new Set(cSales.map((s) => s.id));
      const myItems = items.filter((i) => saleIds.has(i.sale_id));
      const itemQty: Record<string, number> = {};
      myItems.forEach((i) => { itemQty[i.product_name] = (itemQty[i.product_name] ?? 0) + i.quantity; });
      const topItem = Object.keys(itemQty).length
        ? Object.entries(itemQty).sort((a, b) => b[1] - a[1])[0][0] : null;
      const payMethods = [...new Set(cSales.map((s) => s.payment_method).filter(Boolean))];
      return { ...c, totalSales, totalSpent, topItem, lastSaleDate, payMethods };
    });
    setRows(enriched);
  };

  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.phone ?? "").includes(search) ||
    (r.location ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const body = { name: form.name, phone: form.phone || null, location: form.location || null, notes: form.notes || null };
      if (modal === "add") await dbPost("/customers", body);
      else await dbPatch(`/customers?id=eq.${form.id}`, body);
      await load(); onRefresh(); setModal(null);
    } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this customer? Their sales history will be kept.")) return;
    await dbDelete(`/customers?id=eq.${id}`); await load(); onRefresh();
  };

  const openAdd  = () => { setForm({ name:"", phone:"", location:"", notes:"" }); setModal("add"); };
  const openEdit = (r: CustomerRow) => { setForm({ ...r }); setModal("edit"); };
  const openView = (r: CustomerRow) => { setViewing(r); setModal("view"); };
  const payBadgeClass = (m: string) => m === "Cash" ? "bg" : m === "MoMo" ? "ba" : "bb";

  // ── Messaging helpers ─────────────────────────────────────────────────────
  const withPhone = rows.filter((r) => r.phone);

  const openMessage = () => {
    setSelectedIds(new Set(withPhone.map((r) => r.id)));
    setSendResults(null); setTplIdx(0);
    setMsgBody(TEMPLATES[0].body); setMsgChannel("sms");
    setModal("message");
  };

  const toggleAll = () =>
    selectedIds.size === withPhone.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(withPhone.map((r) => r.id)));

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const pickTemplate = (idx: number) => {
    setTplIdx(idx);
    if (idx < TEMPLATES.length - 1) setMsgBody(TEMPLATES[idx].body);
  };

  const personalise = (body: string, name: string) => body.replace(/\{name\}/gi, name);

  const sendMessages = async () => {
    if (!msgBody.trim() || selectedIds.size === 0 || sending) return;
    setSending(true); setSendResults(null);
    const targets = withPhone.filter((r) => selectedIds.has(r.id));
    const results: SendResult[] = [];

    for (const r of targets) {
      try {
        const res = await fetch(`${SB_URL}/functions/v1/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
          body: JSON.stringify({
            recipients: [{ name: r.name, phone: r.phone }],
            message: personalise(msgBody, r.name),
            channel: msgChannel,
          }),
        });
        const data = await res.json();
        if (data.error) results.push({ recipient: r.name, phone: r.phone!, channel: msgChannel, success: false, error: data.error });
        else results.push(...(data.results as SendResult[]));
      } catch (e) {
        results.push({ recipient: r.name, phone: r.phone!, channel: msgChannel, success: false, error: (e as Error).message });
      }
    }
    setSendResults(results); setSending(false);
  };

  const sentCount   = sendResults?.filter((r) => r.success).length ?? 0;
  const failedCount = sendResults?.filter((r) => !r.success).length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fade-up">

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Customers</h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>{rows.length} customers · {withPhone.length} with phone numbers</p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn bg2" onClick={openMessage} disabled={withPhone.length === 0}>📣 Send Message</button>
          <button className="btn bp" onClick={openAdd}>+ Add Customer</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom:16 }}>
        <input type="text" placeholder="Search by name, phone or location…"
          value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth:360 }}/>
      </div>

      {/* Stats strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Total Customers", value: rows.length, icon:"👥", color:"var(--am)" },
          { label:"Total Revenue",   value: fmt(rows.reduce((a,r)=>a+r.totalSpent,0)), icon:"💰", color:"var(--grm)" },
          { label:"Avg. Spend",      value: fmt(rows.length ? rows.reduce((a,r)=>a+r.totalSpent,0)/rows.length : 0), icon:"📊", color:"var(--gd)" },
        ].map((s, i) => (
          <div key={i} style={{ background:"var(--wh)", borderRadius:14, padding:"16px 20px", boxShadow:"var(--sh)", borderTop:`4px solid ${s.color}`, display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ fontSize:26 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"Space Mono", color:s.color }}>{s.value}</div>
              <div style={{ fontSize:12, color:"var(--mu)", marginTop:2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:"var(--wh)", borderRadius:16, boxShadow:"var(--sh)", overflow:"hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Customer</th><th>Phone</th><th>Location</th>
              <th>Total Sales</th><th>Total Spent</th><th>Most Purchased</th>
              <th>Last Sale</th><th>Payment</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign:"center", padding:"40px 0", color:"var(--mu)" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>👥</div>
                {search ? "No customers match your search" : "No customers yet — add your first!"}
              </td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:`hsl(${(r.name.charCodeAt(0)*47)%360},55%,62%)`, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:14, flexShrink:0 }}>
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14 }}>{r.name}</div>
                      {r.notes && <div style={{ fontSize:11, color:"var(--mu)", maxWidth:160, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.notes}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ fontSize:13, color:r.phone?"var(--tx)":"var(--mu)", fontStyle:r.phone?"normal":"italic" }}>{r.phone ?? "—"}</td>
                <td style={{ fontSize:13, color:r.location?"var(--tx)":"var(--mu)", fontStyle:r.location?"normal":"italic" }}>{r.location ? `📍 ${r.location}` : "—"}</td>
                <td>
                  <span style={{ fontFamily:"Space Mono", fontWeight:700, fontSize:15, color:"var(--gr)" }}>{r.totalSales}</span>
                  <span style={{ fontSize:11, color:"var(--mu)", marginLeft:4 }}>sale{r.totalSales!==1?"s":""}</span>
                </td>
                <td style={{ fontFamily:"Space Mono", fontWeight:700, color:"var(--grm)", fontSize:13 }}>{fmt(r.totalSpent)}</td>
                <td style={{ maxWidth:180 }}>
                  {r.topItem
                    ? <span style={{ fontSize:12, background:"var(--cr)", padding:"4px 10px", borderRadius:20, fontWeight:500, display:"inline-block", maxWidth:"100%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>🧺 {r.topItem}</span>
                    : <span style={{ fontSize:12, color:"var(--mu)", fontStyle:"italic" }}>—</span>}
                </td>
                <td style={{ fontSize:13, color:"var(--mu)" }}>{r.lastSaleDate ?? "—"}</td>
                <td>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {r.payMethods.length
                      ? r.payMethods.map((m) => <span key={m} className={`badge ${payBadgeClass(m)}`}>{m}</span>)
                      : <span style={{ fontSize:12, color:"var(--mu)", fontStyle:"italic" }}>—</span>}
                  </div>
                </td>
                <td>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn bgh bs" onClick={() => openView(r)}>👁</button>
                    <button className="btn bgh bs" onClick={() => openEdit(r)}>✏ Edit</button>
                    <button className="btn bs" style={{ background:"#FEE2E2", color:"var(--rd)", border:"none" }} onClick={() => remove(r.id)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit modal ── */}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Customer" : "Edit Customer"} onClose={() => setModal(null)}>
          <Field label="Full Name"><input type="text" value={form.name??""} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="e.g. Abena Mensah"/></Field>
          <Field label="Phone Number"><input type="text" value={form.phone??""} onChange={(e)=>setForm({...form,phone:e.target.value})} placeholder="e.g. +233244123456"/></Field>
          <Field label="Location / Area"><input type="text" value={form.location??""} onChange={(e)=>setForm({...form,location:e.target.value})} placeholder="e.g. Accra, Kumasi…"/></Field>
          <Field label="Notes (optional)"><textarea rows={2} value={form.notes??""} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="e.g. Regular buyer, prefers Children bales" style={{resize:"vertical"}}/></Field>
          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button className="btn bp" onClick={save} style={{ flex:1, justifyContent:"center" }} disabled={saving}>{saving?<Spin/>:"Save Customer"}</button>
            <button className="btn bgh" onClick={()=>setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── View / profile modal ── */}
      {modal === "view" && viewing && (
        <Modal title="Customer Profile" onClose={() => setModal(null)}>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24, padding:"16px 0", borderBottom:"1px solid var(--crd)" }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:`hsl(${(viewing.name.charCodeAt(0)*47)%360},55%,62%)`, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:22, flexShrink:0 }}>
              {viewing.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontFamily:"Playfair Display", fontSize:22, color:"var(--gr)" }}>{viewing.name}</div>
              <div style={{ fontSize:13, color:"var(--mu)", marginTop:3 }}>
                {viewing.phone && <span style={{ marginRight:14 }}>📞 {viewing.phone}</span>}
                {viewing.location && <span>📍 {viewing.location}</span>}
              </div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            {[["Total Sales",viewing.totalSales,"var(--am)"],["Total Spent",fmt(viewing.totalSpent),"var(--grm)"],["Last Purchase",viewing.lastSaleDate??"—","var(--tx)"],["Top Bale",viewing.topItem??"—","var(--gr)"]].map(([l,v,c])=>(
              <div key={l as string} style={{ background:"var(--cr)", borderRadius:12, padding:"12px 16px" }}>
                <div style={{ fontSize:11, color:"var(--mu)", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>{l as string}</div>
                <div style={{ fontWeight:700, color:c as string, fontSize:15, fontFamily:"Space Mono", wordBreak:"break-word" }}>{v as string}</div>
              </div>
            ))}
          </div>
          {viewing.payMethods.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"var(--mu)", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Preferred Payment</div>
              <div style={{ display:"flex", gap:6 }}>{viewing.payMethods.map((m)=><span key={m} className={`badge ${payBadgeClass(m)}`}>{m}</span>)}</div>
            </div>
          )}
          {viewing.notes && (
            <div style={{ background:"var(--cr)", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:12, color:"var(--mu)", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>Notes</div>
              <div style={{ fontSize:13, lineHeight:1.6 }}>{viewing.notes}</div>
            </div>
          )}
          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button className="btn bp" style={{ flex:1, justifyContent:"center" }} onClick={()=>{setModal("edit");setForm({...viewing});}}>✏ Edit Customer</button>
            <button className="btn bgh" onClick={()=>setModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* ── Send Message modal ── */}
      {modal === "message" && (
        <div className="mo" onClick={(e)=>{ if(e.target===e.currentTarget) setModal(null); }}>
          <div style={{ background:"var(--wh)", borderRadius:16, width:820, maxWidth:"96vw", maxHeight:"92vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 12px 48px rgba(0,0,0,0.22)" }}>

            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px", borderBottom:"1px solid var(--crd)" }}>
              <div>
                <h3 style={{ fontFamily:"Playfair Display", fontSize:22, color:"var(--gr)" }}>📣 Send Marketing Message</h3>
                <p style={{ fontSize:13, color:"var(--mu)", marginTop:2 }}>Send personalised SMS and/or WhatsApp messages via Twilio</p>
              </div>
              <button onClick={()=>setModal(null)} className="btn bgh bs">×</button>
            </div>

            {/* Body: two columns */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", flex:1, overflow:"hidden" }}>

              {/* LEFT — compose */}
              <div style={{ padding:"20px 24px", borderRight:"1px solid var(--crd)", overflowY:"auto", display:"flex", flexDirection:"column", gap:18 }}>

                {/* Channel selector */}
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Channel</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {([["sms","💬 SMS"],["whatsapp","🟢 WhatsApp"],["both","📲 Both"]] as [Channel,string][]).map(([ch,label])=>(
                      <button key={ch} onClick={()=>setMsgChannel(ch)}
                        style={{ flex:1, padding:"10px 0", borderRadius:10, border:"1.5px solid", fontSize:13, fontWeight:600, cursor:"pointer", transition:"all .15s",
                          borderColor: msgChannel===ch ? "var(--grm)" : "var(--crd)",
                          background:  msgChannel===ch ? "var(--grm)" : "transparent",
                          color:       msgChannel===ch ? "white"      : "var(--mu)",
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Templates */}
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Template</label>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {TEMPLATES.map((t, i) => (
                      <button key={i} onClick={()=>pickTemplate(i)}
                        style={{ textAlign:"left", padding:"9px 12px", borderRadius:9, border:"1.5px solid", fontSize:13, cursor:"pointer", transition:"all .15s",
                          borderColor: tplIdx===i ? "var(--am)" : "var(--crd)",
                          background:  tplIdx===i ? "#FFF7ED"   : "transparent",
                          color:       tplIdx===i ? "var(--amd)": "var(--tx)",
                          fontWeight:  tplIdx===i ? 600 : 400,
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message body */}
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:6 }}>
                    Message <span style={{ textTransform:"none", fontWeight:400, fontSize:11 }}>— {"{name}"} gets replaced per recipient</span>
                  </label>
                  <textarea value={msgBody}
                    onChange={(e)=>{ setMsgBody(e.target.value); setTplIdx(TEMPLATES.length-1); }}
                    rows={5} placeholder="Type your message here…"
                    style={{ resize:"vertical", lineHeight:1.7 }}/>
                  <div style={{ fontSize:11, color:"var(--mu)", marginTop:4, textAlign:"right" }}>{msgBody.length} chars</div>
                </div>

                {/* Live preview */}
                {msgBody.trim() && (
                  <div style={{ background:"#E8F5E9", borderRadius:12, padding:"12px 16px", border:"1px solid #C8E6C9" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#2E7D32", textTransform:"uppercase", letterSpacing:".5px", marginBottom:6 }}>
                      Preview — {withPhone.find(r=>selectedIds.has(r.id))?.name ?? "Customer"}
                    </div>
                    <div style={{ fontSize:13, lineHeight:1.7, color:"#1B5E20", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                      {personalise(msgBody, withPhone.find(r=>selectedIds.has(r.id))?.name ?? "Customer")}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — recipients */}
              <div style={{ padding:"20px 24px", overflowY:"auto", display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px" }}>
                    Recipients ({selectedIds.size}/{withPhone.length})
                  </label>
                  <button onClick={toggleAll} style={{ fontSize:12, color:"var(--am)", background:"none", border:"none", fontWeight:600, cursor:"pointer" }}>
                    {selectedIds.size === withPhone.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {withPhone.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"30px 0", color:"var(--mu)" }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>📵</div>
                    <div style={{ fontSize:13, lineHeight:1.6 }}>No customers have phone numbers yet.<br/>Add them via Edit on the customer profiles.</div>
                  </div>
                ) : withPhone.map((r) => {
                  const sel = selectedIds.has(r.id);
                  return (
                    <div key={r.id} onClick={()=>toggleOne(r.id)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, border:"1.5px solid", cursor:"pointer", transition:"all .15s",
                        borderColor: sel ? "var(--grm)" : "var(--crd)",
                        background:  sel ? "#F0FDF4"    : "transparent",
                      }}>
                      {/* Checkbox */}
                      <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${sel?"var(--grm)":"var(--crd)"}`, background:sel?"var(--grm)":"white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .15s" }}>
                        {sel && <span style={{ fontSize:11, color:"white", lineHeight:1 }}>✓</span>}
                      </div>
                      {/* Avatar */}
                      <div style={{ width:32, height:32, borderRadius:"50%", background:`hsl(${(r.name.charCodeAt(0)*47)%360},55%,62%)`, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:13, flexShrink:0 }}>
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.name}</div>
                        <div style={{ fontSize:11, color:"var(--mu)" }}>📞 {r.phone}</div>
                      </div>
                      {r.totalSales > 0 && (
                        <span style={{ fontSize:10, color:"var(--grm)", fontWeight:600, background:"#D1FAE5", padding:"2px 7px", borderRadius:10, flexShrink:0 }}>
                          {r.totalSales} sale{r.totalSales!==1?"s":""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding:"16px 24px", borderTop:"1px solid var(--crd)", background:"var(--cr)" }}>

              {/* Send results */}
              {sendResults && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", gap:12, marginBottom:6, alignItems:"center" }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"#065F46" }}>✓ {sentCount} sent</span>
                    {failedCount > 0 && <span style={{ fontSize:13, fontWeight:700, color:"var(--rd)" }}>✗ {failedCount} failed</span>}
                  </div>
                  <div style={{ maxHeight:90, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                    {sendResults.map((r, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, padding:"4px 8px", borderRadius:6, background:r.success?"#D1FAE5":"#FEE2E2" }}>
                        <span>{r.success ? "✓" : "✗"}</span>
                        <span style={{ fontWeight:600 }}>{r.recipient}</span>
                        <span style={{ color:"var(--mu)", fontSize:11 }}>({r.channel.toUpperCase()})</span>
                        {!r.success && r.error && (
                          <span style={{ color:"var(--rd)", marginLeft:"auto", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.error}</span>
                        )}
                        {r.success && r.sid && (
                          <span style={{ color:"#065F46", marginLeft:"auto", fontFamily:"monospace", fontSize:10, opacity:.7 }}>{r.sid}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:13, color:"var(--mu)" }}>
                  {selectedIds.size === 0
                    ? "Select at least one recipient"
                    : `${selectedIds.size} recipient${selectedIds.size!==1?"s":""} · ${msgChannel === "both" ? "SMS + WhatsApp" : msgChannel.toUpperCase()}`}
                </span>
                <div style={{ display:"flex", gap:10 }}>
                  <button className="btn bgh" onClick={()=>setModal(null)}>Close</button>
                  <button className="btn bg2" onClick={sendMessages}
                    disabled={sending || selectedIds.size === 0 || !msgBody.trim()}
                    style={{ minWidth:150, justifyContent:"center" }}>
                    {sending ? <><Spin /> Sending…</> : `📤 Send to ${selectedIds.size}`}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
