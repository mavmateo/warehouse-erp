import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch, dbDelete } from "@/lib/api";
import { fmt } from "@/lib/utils";

interface Customer {
  id:         number;
  name:       string;
  phone:      string | null;
  location:   string | null;
  notes:      string | null;
  created_at: string | null;
}

interface Sale {
  id:             number;
  customer_id:    number | null;
  customer:       string | null;
  total:          number;
  sale_date:      string;
  payment_method: string;
}

interface SaleItem {
  sale_id:      number;
  product_name: string;
  quantity:     number;
}

interface CustomerRow extends Customer {
  totalSales:   number;
  totalSpent:   number;
  topItem:      string | null;
  lastSaleDate: string | null;
  payMethods:   string[];
}

type FormState = Partial<Customer>;

export function Customers({ onRefresh }: { onRefresh: () => void }) {
  const [rows,    setRows]    = useState<CustomerRow[]>([]);
  const [modal,   setModal]   = useState<"add" | "edit" | "view" | null>(null);
  const [form,    setForm]    = useState<FormState>({});
  const [viewing, setViewing] = useState<CustomerRow | null>(null);
  const [search,  setSearch]  = useState("");
  const [saving,  setSaving]  = useState(false);

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
        ? cSales.sort((a, b) => b.sale_date.localeCompare(a.sale_date))[0].sale_date
        : null;

      // Most purchased item by total quantity across all their sales
      const saleIds = new Set(cSales.map((s) => s.id));
      const myItems = items.filter((i) => saleIds.has(i.sale_id));
      const itemQty: Record<string, number> = {};
      myItems.forEach((i) => {
        itemQty[i.product_name] = (itemQty[i.product_name] ?? 0) + i.quantity;
      });
      const topItem = Object.keys(itemQty).length
        ? Object.entries(itemQty).sort((a, b) => b[1] - a[1])[0][0]
        : null;

      const payMethods = [...new Set(cSales.map((s) => s.payment_method).filter(Boolean))];

      return { ...c, totalSales, totalSpent, topItem, lastSaleDate, payMethods };
    });

    setRows(enriched);
  };

  useEffect(() => { void load(); }, []);

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.phone ?? "").includes(search) ||
      (r.location ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const body = { name: form.name, phone: form.phone || null, location: form.location || null, notes: form.notes || null };
      if (modal === "add") await dbPost("/customers", body);
      else await dbPatch(`/customers?id=eq.${form.id}`, body);
      await load();
      onRefresh();
      setModal(null);
    } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this customer? Their sales history will be kept.")) return;
    await dbDelete(`/customers?id=eq.${id}`);
    await load();
    onRefresh();
  };

  const openAdd  = () => { setForm({ name:"", phone:"", location:"", notes:"" }); setModal("add"); };
  const openEdit = (r: CustomerRow) => { setForm({ ...r }); setModal("edit"); };
  const openView = (r: CustomerRow) => { setViewing(r); setModal("view"); };

  const payBadgeClass = (m: string) =>
    m === "Cash" ? "bg" : m === "MoMo" ? "ba" : "bb";

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Customers</h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>{rows.length} customers · linked to sales history</p>
        </div>
        <button className="btn bp" onClick={openAdd}>+ Add Customer</button>
      </div>

      {/* Search */}
      <div style={{ marginBottom:16 }}>
        <input
          type="text"
          placeholder="Search by name, phone or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth:360 }}
        />
      </div>

      {/* Stats strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Total Customers",  value: rows.length,                                                     icon:"👥", color:"var(--am)" },
          { label:"Total Revenue",    value: fmt(rows.reduce((a, r) => a + r.totalSpent, 0)),                 icon:"💰", color:"var(--grm)" },
          { label:"Avg. Spend",       value: fmt(rows.length ? rows.reduce((a,r)=>a+r.totalSpent,0)/rows.length : 0), icon:"📊", color:"var(--gd)" },
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
              <th>Customer</th>
              <th>Phone</th>
              <th>Location</th>
              <th>Total Sales</th>
              <th>Total Spent</th>
              <th>Most Purchased</th>
              <th>Last Sale</th>
              <th>Payment</th>
              <th>Actions</th>
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
                {/* Name */}
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

                {/* Phone */}
                <td style={{ fontSize:13, color: r.phone ? "var(--tx)" : "var(--mu)", fontStyle: r.phone ? "normal" : "italic" }}>
                  {r.phone ?? "—"}
                </td>

                {/* Location */}
                <td style={{ fontSize:13, color: r.location ? "var(--tx)" : "var(--mu)", fontStyle: r.location ? "normal" : "italic" }}>
                  {r.location ? `📍 ${r.location}` : "—"}
                </td>

                {/* Total sales */}
                <td>
                  <span style={{ fontFamily:"Space Mono", fontWeight:700, fontSize:15, color:"var(--gr)" }}>{r.totalSales}</span>
                  <span style={{ fontSize:11, color:"var(--mu)", marginLeft:4 }}>sale{r.totalSales !== 1 ? "s" : ""}</span>
                </td>

                {/* Total spent */}
                <td style={{ fontFamily:"Space Mono", fontWeight:700, color:"var(--grm)", fontSize:13 }}>
                  {fmt(r.totalSpent)}
                </td>

                {/* Most purchased */}
                <td style={{ maxWidth:180 }}>
                  {r.topItem
                    ? <span style={{ fontSize:12, background:"var(--cr)", padding:"4px 10px", borderRadius:20, fontWeight:500, display:"inline-block", maxWidth:"100%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>🧺 {r.topItem}</span>
                    : <span style={{ fontSize:12, color:"var(--mu)", fontStyle:"italic" }}>—</span>
                  }
                </td>

                {/* Last sale */}
                <td style={{ fontSize:13, color:"var(--mu)" }}>
                  {r.lastSaleDate ?? "—"}
                </td>

                {/* Payment methods */}
                <td>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {r.payMethods.length
                      ? r.payMethods.map((m) => <span key={m} className={`badge ${payBadgeClass(m)}`}>{m}</span>)
                      : <span style={{ fontSize:12, color:"var(--mu)", fontStyle:"italic" }}>—</span>
                    }
                  </div>
                </td>

                {/* Actions */}
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

      {/* Add / Edit modal */}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Customer" : "Edit Customer"} onClose={() => setModal(null)}>
          <Field label="Full Name">
            <input type="text" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Abena Mensah" />
          </Field>
          <Field label="Phone Number">
            <input type="text" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0244 123 456" />
          </Field>
          <Field label="Location / Area">
            <input type="text" value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Accra, Kumasi, Takoradi…" />
          </Field>
          <Field label="Notes (optional)">
            <textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Regular buyer, prefers Children bales" style={{ resize:"vertical" }} />
          </Field>
          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button className="btn bp" onClick={save} style={{ flex:1, justifyContent:"center" }} disabled={saving}>
              {saving ? <Spin /> : "Save Customer"}
            </button>
            <button className="btn bgh" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* View / profile modal */}
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
            {[
              ["Total Sales",    viewing.totalSales,             "var(--am)"],
              ["Total Spent",    fmt(viewing.totalSpent),        "var(--grm)"],
              ["Last Purchase",  viewing.lastSaleDate ?? "—",    "var(--tx)"],
              ["Top Bale",       viewing.topItem ?? "—",         "var(--gr)"],
            ].map(([l, v, c]) => (
              <div key={l as string} style={{ background:"var(--cr)", borderRadius:12, padding:"12px 16px" }}>
                <div style={{ fontSize:11, color:"var(--mu)", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>{l as string}</div>
                <div style={{ fontWeight:700, color:c as string, fontSize:15, fontFamily:"Space Mono", wordBreak:"break-word" }}>{v as string}</div>
              </div>
            ))}
          </div>

          {viewing.payMethods.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"var(--mu)", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Preferred Payment</div>
              <div style={{ display:"flex", gap:6 }}>
                {viewing.payMethods.map((m) => <span key={m} className={`badge ${payBadgeClass(m)}`}>{m}</span>)}
              </div>
            </div>
          )}

          {viewing.notes && (
            <div style={{ background:"var(--cr)", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:12, color:"var(--mu)", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>Notes</div>
              <div style={{ fontSize:13, lineHeight:1.6 }}>{viewing.notes}</div>
            </div>
          )}

          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button className="btn bp" style={{ flex:1, justifyContent:"center" }} onClick={() => { setModal("edit"); setForm({ ...viewing }); }}>✏ Edit Customer</button>
            <button className="btn bgh" onClick={() => setModal(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
