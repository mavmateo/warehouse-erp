import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch, dbDelete } from "@/lib/api";
import { fmt } from "@/lib/utils";

const WA_URL = (import.meta.env.VITE_WHATSAPP_SERVER_URL as string) || "http://localhost:3001";

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
  recipient: string; phone: string; success: boolean; error?: string;
}

type WaStatus = "initialising" | "qr" | "ready" | "disconnected" | "auth_failure" | "unreachable";

interface WaStatusResponse {
  status:  WaStatus;
  ready:   boolean;
  qr:      string | null;
  message: string;
}

type FormState = Partial<Customer>;
type ModalType = "add" | "edit" | "view" | "message" | "qr" | null;

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

  // ── WhatsApp status ───────────────────────────────────────────────────────
  const [waStatus,  setWaStatus]  = useState<WaStatusResponse | null>(null);
  const [waLoading, setWaLoading] = useState(true);

  const pollWaStatus = useCallback(async () => {
    try {
      const res = await fetch(`${WA_URL}/status`, { signal: AbortSignal.timeout(4000) });
      const data: WaStatusResponse = await res.json();
      setWaStatus(data);
      // If QR modal is open and we just became ready, close it
      if (data.ready) setModal((m) => m === "qr" ? null : m);
    } catch {
      setWaStatus({ status: "unreachable", ready: false, qr: null, message: "WhatsApp server not running. Start it with: cd apps/whatsapp-server && npm start" });
    } finally {
      setWaLoading(false);
    }
  }, []);

  // Poll every 4 seconds while QR is showing, every 20s otherwise
  useEffect(() => {
    pollWaStatus();
    const interval = setInterval(pollWaStatus, waStatus?.status === "qr" ? 4000 : 20000);
    return () => clearInterval(interval);
  }, [pollWaStatus, waStatus?.status]);

  // ── Messaging state ───────────────────────────────────────────────────────
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

  // ── WhatsApp status helpers ───────────────────────────────────────────────
  const waStatusColor = {
    ready:        "#16a34a",
    qr:           "#d97706",
    initialising: "#6b7280",
    disconnected: "#dc2626",
    auth_failure: "#dc2626",
    unreachable:  "#dc2626",
  }[waStatus?.status ?? "unreachable"];

  const waStatusIcon = {
    ready:        "🟢",
    qr:           "📱",
    initialising: "⏳",
    disconnected: "🔴",
    auth_failure: "❌",
    unreachable:  "⚠️",
  }[waStatus?.status ?? "unreachable"];

  // ── Messaging helpers ─────────────────────────────────────────────────────
  const withPhone = rows.filter((r) => r.phone);

  const openMessage = () => {
    if (!waStatus?.ready) { setModal("qr"); return; }
    setSelectedIds(new Set(withPhone.map((r) => r.id)));
    setSendResults(null); setTplIdx(0);
    setMsgBody(TEMPLATES[0].body);
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
        const res = await fetch(`${WA_URL}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients: [{ name: r.name, phone: r.phone }],
            message: personalise(msgBody, r.name),
          }),
        });
        const data = await res.json();
        if (data.error) results.push({ recipient: r.name, phone: r.phone!, success: false, error: data.error });
        else results.push(...(data.results as SendResult[]));
      } catch (e) {
        results.push({ recipient: r.name, phone: r.phone!, success: false, error: (e as Error).message });
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
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Customers</h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>{rows.length} customers · {withPhone.length} with phone numbers</p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn bg2" onClick={openMessage} disabled={withPhone.length === 0 || waLoading}>
            🟢 Send WhatsApp
          </button>
          <button className="btn bp" onClick={openAdd}>+ Add Customer</button>
        </div>
      </div>

      {/* WhatsApp status banner */}
      {!waLoading && (
        <div onClick={() => setModal("qr")}
          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderRadius:10, marginBottom:16, cursor:"pointer", transition:"opacity .15s",
            background: waStatus?.ready ? "#F0FDF4" : "#FFF7ED",
            border: `1.5px solid ${waStatus?.ready ? "#86efac" : "#fed7aa"}`,
          }}>
          <span style={{ fontSize:16 }}>{waStatusIcon}</span>
          <div style={{ flex:1 }}>
            <span style={{ fontSize:13, fontWeight:600, color: waStatusColor }}>WhatsApp: {waStatus?.status ?? "unreachable"}</span>
            <span style={{ fontSize:12, color:"var(--mu)", marginLeft:8 }}>{waStatus?.message}</span>
          </div>
          {!waStatus?.ready && (
            <span style={{ fontSize:12, color:"var(--am)", fontWeight:600 }}>
              {waStatus?.status === "qr" ? "📱 Tap to scan QR →" : "Tap for details →"}
            </span>
          )}
          {waStatus?.ready && (
            <span style={{ fontSize:12, color:"#16a34a", fontWeight:600 }}>Tap to manage →</span>
          )}
        </div>
      )}

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
          <Field label="Phone Number"><input type="text" value={form.phone??""} onChange={(e)=>setForm({...form,phone:e.target.value})} placeholder="e.g. 0244123456 or +233244123456"/></Field>
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

      {/* ── WhatsApp QR / Status modal ── */}
      {modal === "qr" && (
        <Modal title="WhatsApp Connection" onClose={() => setModal(null)}>
          <div style={{ textAlign:"center" }}>
            {waStatus?.status === "ready" ? (
              <>
                <div style={{ fontSize:52, marginBottom:12 }}>🟢</div>
                <div style={{ fontFamily:"Playfair Display", fontSize:20, color:"var(--gr)", marginBottom:6 }}>Connected!</div>
                <div style={{ fontSize:13, color:"var(--mu)", marginBottom:24 }}>WhatsApp is linked and ready to send messages.</div>
                <button className="btn bgh" style={{ width:"100%", justifyContent:"center" }} onClick={async () => {
                  await fetch(`${WA_URL}/disconnect`, { method:"POST" });
                  await pollWaStatus();
                }}>Disconnect / Change Account</button>
              </>
            ) : waStatus?.status === "qr" && waStatus.qr ? (
              <>
                <div style={{ fontSize:13, color:"var(--mu)", marginBottom:16, lineHeight:1.7 }}>
                  Open <strong>WhatsApp</strong> on your phone → tap <strong>⋮ Menu → Linked Devices → Link a Device</strong> and scan this code:
                </div>
                <div style={{ display:"inline-block", padding:12, background:"white", borderRadius:12, border:"2px solid var(--crd)", marginBottom:16 }}>
                  <img src={waStatus.qr} alt="WhatsApp QR Code" style={{ width:240, height:240, display:"block" }}/>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center", marginBottom:8 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--am)", animation:"pulse 1.5s ease-in-out infinite" }}/>
                  <span style={{ fontSize:12, color:"var(--mu)" }}>Waiting for scan… refreshes automatically</span>
                </div>
              </>
            ) : waStatus?.status === "initialising" ? (
              <>
                <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>
                <div style={{ fontSize:15, color:"var(--mu)" }}>WhatsApp is starting up…</div>
                <div style={{ fontSize:13, color:"var(--mu)", marginTop:6 }}>This usually takes 10–20 seconds on first run.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
                <div style={{ fontFamily:"Playfair Display", fontSize:18, color:"var(--gr)", marginBottom:8 }}>Server not running</div>
                <div style={{ fontSize:13, color:"var(--mu)", marginBottom:16, lineHeight:1.8 }}>
                  Start the WhatsApp server in a new terminal:
                </div>
                <div style={{ background:"#1A1A1A", color:"#86EFAC", borderRadius:10, padding:"14px 18px", fontFamily:"Space Mono", fontSize:12, textAlign:"left", marginBottom:16, lineHeight:2 }}>
                  <div>cd apps/whatsapp-server</div>
                  <div>npm install</div>
                  <div>npm start</div>
                </div>
                <div style={{ fontSize:12, color:"var(--mu)" }}>This page will connect automatically once the server is running.</div>
              </>
            )}
          </div>
          <div style={{ marginTop:20 }}>
            <button className="btn bgh" style={{ width:"100%", justifyContent:"center" }} onClick={() => setModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* ── Send WhatsApp Message modal ── */}
      {modal === "message" && (
        <div className="mo" onClick={(e)=>{ if(e.target===e.currentTarget) setModal(null); }}
          style={{ alignItems:"flex-start", paddingTop:70, overflowY:"auto" }}>
          <div style={{ background:"var(--wh)", borderRadius:16, width:820, maxWidth:"96vw", maxHeight:"calc(100vh - 90px)", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 12px 48px rgba(0,0,0,0.22)" }}>

            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px", borderBottom:"1px solid var(--crd)" }}>
              <div>
                <h3 style={{ fontFamily:"Playfair Display", fontSize:22, color:"var(--gr)" }}>🟢 Send WhatsApp Message</h3>
                <p style={{ fontSize:13, color:"var(--mu)", marginTop:2 }}>Send personalised WhatsApp messages to your customers</p>
              </div>
              <button onClick={()=>setModal(null)} className="btn bgh bs">×</button>
            </div>

            {/* Body: two columns */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", flex:1, overflow:"hidden" }}>

              {/* LEFT — compose */}
              <div style={{ padding:"20px 24px", borderRight:"1px solid var(--crd)", overflowY:"auto", display:"flex", flexDirection:"column", gap:18 }}>

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

                {/* Live preview — WhatsApp bubble style */}
                {msgBody.trim() && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:"var(--mu)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>
                      Preview — {withPhone.find(r=>selectedIds.has(r.id))?.name ?? "Customer"}
                    </div>
                    <div style={{ background:"#DCF8C6", borderRadius:"0 12px 12px 12px", padding:"10px 14px", display:"inline-block", maxWidth:"100%", boxShadow:"0 1px 2px rgba(0,0,0,.1)" }}>
                      <div style={{ fontSize:13, lineHeight:1.7, color:"#111", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                        {personalise(msgBody, withPhone.find(r=>selectedIds.has(r.id))?.name ?? "Customer")}
                      </div>
                      <div style={{ fontSize:10, color:"#667781", textAlign:"right", marginTop:4 }}>
                        {new Date().toLocaleTimeString("en-GH", { hour:"2-digit", minute:"2-digit" })} ✓✓
                      </div>
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
                        borderColor: sel ? "#16a34a" : "var(--crd)",
                        background:  sel ? "#F0FDF4" : "transparent",
                      }}>
                      <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${sel?"#16a34a":"var(--crd)"}`, background:sel?"#16a34a":"white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .15s" }}>
                        {sel && <span style={{ fontSize:11, color:"white", lineHeight:1 }}>✓</span>}
                      </div>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:`hsl(${(r.name.charCodeAt(0)*47)%360},55%,62%)`, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:13, flexShrink:0 }}>
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.name}</div>
                        <div style={{ fontSize:11, color:"var(--mu)" }}>📞 {r.phone}</div>
                      </div>
                      {r.totalSales > 0 && (
                        <span style={{ fontSize:10, color:"#16a34a", fontWeight:600, background:"#D1FAE5", padding:"2px 7px", borderRadius:10, flexShrink:0 }}>
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
                        <span style={{ color:"var(--mu)", fontSize:11 }}>({r.phone})</span>
                        {!r.success && r.error && (
                          <span style={{ color:"var(--rd)", marginLeft:"auto", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.error}</span>
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
                    : `${selectedIds.size} recipient${selectedIds.size!==1?"s":""} via WhatsApp`}
                </span>
                <div style={{ display:"flex", gap:10 }}>
                  <button className="btn bgh" onClick={()=>setModal(null)}>Close</button>
                  <button className="btn bg2" onClick={sendMessages}
                    disabled={sending || selectedIds.size === 0 || !msgBody.trim()}
                    style={{ minWidth:160, justifyContent:"center", background:"#16a34a", borderColor:"#16a34a", color:"white" }}>
                    {sending ? <><Spin /> Sending…</> : `🟢 Send to ${selectedIds.size}`}
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
