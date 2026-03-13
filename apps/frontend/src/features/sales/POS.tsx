import { useState, useEffect, useRef } from "react";
import { Field } from "@/components/ui/Field";
import { Spin }  from "@/components/ui/Spin";
import { dbGet, dbPost, dbPatch } from "@/lib/api";
import { today, fmt } from "@/lib/utils";
import type { Product, PaymentMethod } from "@erp/types";

const WA_URL = (import.meta.env.VITE_WHATSAPP_SERVER_URL as string) || "http://localhost:3001";

/** Fire-and-forget WhatsApp thank-you. Never throws — sale must never fail because of this. */
async function sendThankYou(name: string, phone: string, total: number) {
  const message =
    `Hi ${name}! 🙏 Thank you for shopping at BaleShop GH.\n` +
    `Your purchase of ${new Intl.NumberFormat("en-GH", { style:"currency", currency:"GHS" }).format(total)} has been recorded.\n` +
    `We look forward to seeing you again! — BaleShop GH 🧺`;
  try {
    await fetch(`${WA_URL}/send`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ recipients: [{ name, phone }], message }),
      signal:  AbortSignal.timeout(10000),
    });
  } catch {
    // Silently ignore — WhatsApp server may be offline; sale is already saved
  }
}

interface CartItem { pid: number; name: string; price: number; qty: number; max: number; }

interface Customer { id: number; name: string; phone: string | null; location: string | null; }

// Status of customer link after a completed sale
type LinkStatus = "linked" | "created" | "walk-in" | null;

export function POS({ onRefresh }: { onRefresh: () => void }) {
  const [products,    setProducts]    = useState<Product[]>([]);
  const [customers,   setCustomers]   = useState<Customer[]>([]);
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [customer,    setCustomer]    = useState("Walk-in");
  const [linkedCust,  setLinkedCust]  = useState<Customer | null>(null);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSug,     setShowSug]     = useState(false);
  const [payment,     setPayment]     = useState<PaymentMethod>("Cash");
  const [search,      setSearch]      = useState("");
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState(false);
  const [linkStatus,  setLinkStatus]  = useState<LinkStatus>(null);
  const [saleTotal,   setSaleTotal]   = useState(0);
  const custRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dbGet<Product[]>("/products?order=name&stock=gt.0").then(setProducts);
    dbGet<Customer[]>("/customers?select=id,name,phone,location&order=name").then(setCustomers);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowSug(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const total    = cart.reduce((a, i) => a + i.price * i.qty, 0);

  // Update suggestions and clear explicit link when user types manually
  const handleCustomerType = (val: string) => {
    setCustomer(val);
    setLinkedCust(null); // clear any previously selected customer
    if (val.trim().length < 1 || val === "Walk-in") {
      setSuggestions([]); setShowSug(false); return;
    }
    const matches = customers.filter((c) =>
      c.name.toLowerCase().includes(val.toLowerCase()),
    );
    setSuggestions(matches);
    setShowSug(matches.length > 0);
  };

  // User picks a suggestion — explicitly link them
  const pickCustomer = (c: Customer) => {
    setCustomer(c.name);
    setLinkedCust(c);
    setSuggestions([]);
    setShowSug(false);
  };

  const addToCart = (p: Product) => setCart((prev) => {
    const ex = prev.find((i) => i.pid === p.id);
    if (ex) return prev.map((i) => i.pid === p.id ? { ...i, qty: Math.min(i.qty + 1, p.stock) } : i);
    return [...prev, { pid: p.id, name: p.name, price: +p.sell_price, qty: 1, max: +p.stock }];
  });

  const upQty = (pid: number, qty: number) => {
    if (qty < 1) return;
    setCart((prev) => prev.map((i) => i.pid === pid ? { ...i, qty: Math.min(qty, i.max) } : i));
  };

  const complete = async () => {
    if (!cart.length || saving) return;
    setSaving(true);
    try {
      const trimmedName = customer.trim();
      const isWalkIn    = !trimmedName || trimmedName.toLowerCase() === "walk-in";

      // ── Resolve customer_id ──────────────────────────────────────
      let customerId: number | null = null;
      let status: LinkStatus        = "walk-in";

      if (!isWalkIn) {
        if (linkedCust) {
          // User picked from dropdown — already linked
          customerId = linkedCust.id;
          status     = "linked";
        } else {
          // Try exact-match (case-insensitive) against all customers
          const exact = customers.find(
            (c) => c.name.toLowerCase() === trimmedName.toLowerCase(),
          );
          if (exact) {
            customerId = exact.id;
            status     = "linked";
          } else {
            // New name — auto-create a customer record
            const [newCust] = await dbPost<[Customer]>("/customers", { name: trimmedName });
            customerId = newCust.id;
            // Refresh customers list so future sales can find them
            setCustomers((prev) => [...prev, newCust].sort((a, b) => a.name.localeCompare(b.name)));
            status = "created";
          }
        }
      }

      // ── Save the sale ────────────────────────────────────────────
      const salePayload: Record<string, unknown> = {
        sale_date:      today(),
        customer:       isWalkIn ? "Walk-in" : trimmedName,
        payment_method: payment,
        total,
      };
      if (customerId) salePayload.customer_id = customerId;

      const [saleRow] = await dbPost<[{ id: number }]>("/sales", salePayload);

      // ── Save sale items ──────────────────────────────────────────
      await Promise.all(cart.map((item) =>
        dbPost("/sale_items", {
          sale_id:      saleRow.id,
          product_id:   item.pid,
          product_name: item.name,
          quantity:     item.qty,
          unit_price:   item.price,
        }),
      ));

      // ── Decrement stock ──────────────────────────────────────────
      await Promise.all(cart.map((item) => {
        const p = products.find((x) => x.id === item.pid);
        return p ? dbPatch(`/products?id=eq.${item.pid}`, { stock: p.stock - item.qty }) : Promise.resolve();
      }));

      // ── WhatsApp thank-you (fire-and-forget) ──────────────────────
      // Resolve the linked customer's phone — covers all three link states
      const linkedPhone = (
        linkedCust?.phone ??
        customers.find((c) => c.name.toLowerCase() === trimmedName.toLowerCase())?.phone ??
        null
      );
      if (customerId && linkedPhone) {
        void sendThankYou(trimmedName, linkedPhone, total);
      }

      onRefresh();
      setSaleTotal(total);
      setLinkStatus(status);
      setDone(true);
      setTimeout(() => {
        setCart([]); setCustomer("Walk-in"); setLinkedCust(null);
        setDone(false); setSaving(false); setLinkStatus(null);
      }, 3000);
    } catch (e) {
      alert("Error saving sale: " + (e as Error).message);
      setSaving(false);
    }
  };

  // Customer field status indicator
  const custStatus = (() => {
    if (!customer || customer === "Walk-in") return null;
    if (linkedCust) return { label: "linked", color: "#065F46", bg: "#D1FAE5", icon: "✓" };
    const exact = customers.find((c) => c.name.toLowerCase() === customer.toLowerCase());
    if (exact)    return { label: "will link", color: "#065F46", bg: "#D1FAE5", icon: "✓" };
    return          { label: "new customer", color: "#92400E", bg: "#FEF3C7", icon: "+" };
  })();

  return (
    <div className="fade-up" style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:20, height:"calc(100vh - 130px)" }}>
      {/* ── Product grid ── */}
      <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)",display:"flex",flexDirection:"column",gap:14,overflow:"hidden" }}>
        <div style={{ display:"flex",gap:10,alignItems:"center" }}>
          <h3 style={{ fontFamily:"Playfair Display",fontSize:20,color:"var(--gr)",flexShrink:0 }}>Stock Bales</h3>
          <input type="text" placeholder="Search bales…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex:1 }} />
        </div>
        <div style={{ overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,flex:1 }}>
          {filtered.map((p) => (
            <div key={p.id} onClick={() => addToCart(p)}
              style={{ background:"var(--cr)",borderRadius:12,padding:"12px 14px",cursor:"pointer",border:"2px solid transparent",transition:"all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor="var(--am)"; e.currentTarget.style.background="var(--crd)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor="transparent"; e.currentTarget.style.background="var(--cr)"; }}>
              <div style={{ fontSize:22,marginBottom:4 }}>🧺</div>
              <div style={{ fontWeight:600,fontSize:12,lineHeight:1.3,marginBottom:4 }}>{p.name}</div>
              <div style={{ fontWeight:700,color:"var(--am)",fontFamily:"Space Mono",fontSize:13 }}>{fmt(p.sell_price)}</div>
              <div style={{ fontSize:11,color:p.stock<=p.reorder_level?"var(--rd)":"var(--mu)",marginTop:3 }}>{p.stock} in stock</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cart ── */}
      <div style={{ background:"var(--wh)",borderRadius:16,padding:20,boxShadow:"var(--sh)",display:"flex",flexDirection:"column",gap:14 }}>
        {done ? (
          <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6 }}>
            <div style={{ fontSize:60,marginBottom:4 }}>🎉</div>
            <h3 style={{ fontFamily:"Playfair Display",fontSize:24,color:"var(--gr)" }}>Sale Complete!</h3>
            <div style={{ fontSize:32,fontWeight:700,fontFamily:"Space Mono",color:"var(--am)" }}>{fmt(saleTotal)}</div>

            {/* Customer link status pill */}
            {linkStatus === "linked" && (
              <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:8,background:"#D1FAE5",borderRadius:20,padding:"6px 14px" }}>
                <span style={{ fontSize:14 }}>👤</span>
                <span style={{ fontSize:12,fontWeight:600,color:"#065F46" }}>Linked to {customer}</span>
              </div>
            )}
            {linkStatus === "created" && (
              <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:8,background:"#FEF3C7",borderRadius:20,padding:"6px 14px" }}>
                <span style={{ fontSize:14 }}>✨</span>
                <span style={{ fontSize:12,fontWeight:600,color:"#92400E" }}>New customer created: {customer}</span>
              </div>
            )}
            {linkStatus === "walk-in" && (
              <div style={{ color:"var(--mu)",fontSize:13,marginTop:6 }}>Walk-in · Saved to Supabase ✓</div>
            )}
          </div>
        ) : (
          <>
            <h3 style={{ fontFamily:"Playfair Display",fontSize:20,color:"var(--gr)" }}>Cart 🛒</h3>

            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              {/* Customer field with autocomplete */}
              <div ref={custRef} style={{ position:"relative" }}>
                <Field label="Customer">
                  <div style={{ position:"relative" }}>
                    <input
                      type="text"
                      value={customer}
                      onChange={(e) => handleCustomerType(e.target.value)}
                      onFocus={() => { if (suggestions.length) setShowSug(true); }}
                      placeholder="Name or Walk-in"
                      style={{ paddingRight: custStatus ? 90 : 14 }}
                    />
                    {/* Inline status badge */}
                    {custStatus && (
                      <span style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:10,fontWeight:700,background:custStatus.bg,color:custStatus.color,padding:"2px 7px",borderRadius:10,pointerEvents:"none",whiteSpace:"nowrap" }}>
                        {custStatus.icon} {custStatus.label}
                      </span>
                    )}
                  </div>
                </Field>

                {/* Autocomplete dropdown */}
                {showSug && suggestions.length > 0 && (
                  <div style={{ position:"absolute",top:"100%",left:0,right:0,zIndex:200,background:"var(--wh)",border:"1.5px solid var(--am)",borderRadius:10,boxShadow:"var(--shl)",overflow:"hidden",marginTop:2 }}>
                    {suggestions.map((c) => (
                      <div key={c.id} onMouseDown={() => pickCustomer(c)}
                        style={{ padding:"9px 12px",cursor:"pointer",borderBottom:"1px solid var(--crd)",transition:"background .1s" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cr)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "white"; }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <div style={{ width:26,height:26,borderRadius:"50%",background:`hsl(${(c.name.charCodeAt(0)*47)%360},55%,62%)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:11,flexShrink:0 }}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:600,fontSize:13 }}>{c.name}</div>
                            {(c.phone || c.location) && (
                              <div style={{ fontSize:11,color:"var(--mu)" }}>
                                {c.phone && <span style={{ marginRight:8 }}>📞 {c.phone}</span>}
                                {c.location && <span>📍 {c.location}</span>}
                              </div>
                            )}
                          </div>
                          <span style={{ marginLeft:"auto",fontSize:10,color:"var(--am)",fontWeight:600 }}>select</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Payment">
                <select value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
                  {(["Cash","MoMo","Bank Transfer","Credit"] as PaymentMethod[]).map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8 }}>
              {!cart.length && <div style={{ textAlign:"center",padding:"30px 0",color:"var(--mu)" }}><div style={{ fontSize:36,marginBottom:6 }}>🛒</div>Click bales to add</div>}
              {cart.map((item) => (
                <div key={item.pid} style={{ background:"var(--cr)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{item.name}</div>
                    <div style={{ color:"var(--am)",fontFamily:"Space Mono",fontSize:12 }}>{fmt(item.price)}</div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <button onClick={() => upQty(item.pid,item.qty-1)} style={{ width:26,height:26,borderRadius:6,border:"1.5px solid var(--crd)",background:"white",fontWeight:700,fontSize:16 }}>−</button>
                    <span style={{ width:22,textAlign:"center",fontWeight:700,fontFamily:"Space Mono",fontSize:14 }}>{item.qty}</span>
                    <button onClick={() => upQty(item.pid,item.qty+1)} style={{ width:26,height:26,borderRadius:6,border:"1.5px solid var(--crd)",background:"white",fontWeight:700,fontSize:16 }}>+</button>
                  </div>
                  <div style={{ fontWeight:700,fontFamily:"Space Mono",fontSize:13,width:72,textAlign:"right" }}>{fmt(item.price*item.qty)}</div>
                  <button onClick={() => setCart((prev) => prev.filter((i) => i.pid !== item.pid))} style={{ color:"var(--rd)",background:"none",border:"none",fontSize:18,fontWeight:700 }}>×</button>
                </div>
              ))}
            </div>

            <div style={{ borderTop:"2px dashed var(--crd)",paddingTop:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                <span style={{ fontSize:16,fontWeight:600 }}>Total</span>
                <span style={{ fontFamily:"Space Mono",fontSize:26,fontWeight:700,color:"var(--gr)" }}>{fmt(total)}</span>
              </div>
              <button className="btn bg2" onClick={complete} style={{ width:"100%",justifyContent:"center",fontSize:15,padding:"14px",borderRadius:12 }} disabled={!cart.length || saving}>
                {saving ? <Spin /> : "Complete Sale ✓"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
