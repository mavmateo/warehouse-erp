type Page = "dashboard" | "pos" | "inventory" | "sales" | "expenses" | "suppliers" | "reports" | "query" |"scanner";

interface SidebarProps {
  page:     Page;
  setPage:  (p: Page) => void;
  lowStock: number;
}

const NAV: { id: Page; label: string; icon: string; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard",   icon: "🏠" },
  { id: "pos",       label: "Make a Sale", icon: "🛒" },
  { id: "inventory", label: "Inventory",   icon: "📦" },
  { id: "sales",     label: "Sales",       icon: "🧾" },
  { id: "expenses",  label: "Expenses",    icon: "💸" },
  { id: "customers", label: "Customers",   icon: "👥" },
  { id: "suppliers", label: "Suppliers",   icon: "🤝" },
  { id: "reports",   label: "Reports",     icon: "📊" },
  { id: "query",     label: "Query Data",  icon: "🔍", badge: "AI" },
  { id: "scanner", label: "Scanner", icon: "📋" }
];

export function Sidebar({ page, setPage, lowStock }: SidebarProps) {
  return (
    <div style={{ width:222, background:"var(--gr)", display:"flex", flexDirection:"column", flexShrink:0 }}>
      <div style={{ padding:"20px 18px 0" }}>
        <div className="kente" style={{ borderRadius:3, marginBottom:16 }} />
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ width:38,height:38,borderRadius:10,background:"var(--am)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>🧺</div>
          <div>
            <div style={{ fontFamily:"Playfair Display",fontWeight:900,fontSize:16,color:"white",lineHeight:1 }}>BaleShop GH</div>
            <div style={{ fontSize:9,color:"rgba(255,255,255,0.45)",letterSpacing:"2px",textTransform:"uppercase" }}>ERP · Bale Manager</div>
          </div>
        </div>
      </div>

      <nav style={{ flex:1, padding:"0 10px" }}>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`ni${page === n.id ? " act" : ""}`}
            style={{
              display:"flex",alignItems:"center",gap:10,width:"100%",
              padding:"11px 12px",borderRadius:10,border:"none",
              background:"transparent",
              color: page === n.id ? "white" : "rgba(255,255,255,0.62)",
              fontSize:13,fontWeight:page === n.id ? 600 : 400,
              cursor:"pointer",marginBottom:2,transition:"all .15s",textAlign:"left",
            }}
          >
            <span style={{ fontSize:16 }}>{n.icon}</span>
            <span style={{ flex:1 }}>{n.label}</span>
            {n.id === "inventory" && lowStock > 0 && (
              <span style={{ background:"var(--rd)",color:"white",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 6px" }}>{lowStock}</span>
            )}
            {n.badge && (
              <span style={{ background:"var(--am)",color:"white",fontSize:9,fontWeight:700,borderRadius:6,padding:"2px 5px",letterSpacing:".5px" }}>{n.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* DB status */}
      <div style={{ margin:"0 10px 10px",padding:"10px 14px",background:"rgba(57,211,83,0.1)",borderRadius:10,border:"1px solid rgba(57,211,83,0.2)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:7 }}>
          <div style={{ width:7,height:7,borderRadius:"50%",background:"#39D353" }} />
          <span style={{ fontFamily:"Space Mono",fontSize:11,color:"rgba(255,255,255,0.7)" }}>Supabase</span>
        </div>
        <div style={{ fontFamily:"Space Mono",fontSize:9,color:"rgba(255,255,255,0.35)",marginTop:3 }}>PostgreSQL 15 · eu-west-1</div>
      </div>

      {/* User */}
      <div style={{ padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:34,height:34,borderRadius:"50%",background:"var(--am)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16 }}>👤</div>
          <div>
            <div style={{ fontSize:13,fontWeight:600,color:"white" }}>Shop Owner</div>
            <div style={{ fontSize:10,color:"rgba(255,255,255,0.45)" }}>Admin</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { Page };
