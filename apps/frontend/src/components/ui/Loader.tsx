interface LoaderProps { error?: string | null; }

export function Loader({ error }: LoaderProps) {
  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"var(--gr)", gap:20 }}>
      <div className="kente" style={{ width:220, borderRadius:4 }} />
      <div style={{ fontSize:42 }}>🧺</div>
      <div style={{ fontFamily:"Playfair Display", fontSize:28, color:"white" }}>BaleShop GH</div>
      {error ? (
        <div style={{ background:"#FEE2E2", color:"#991B1B", padding:"14px 22px", borderRadius:12, maxWidth:440, textAlign:"center", fontSize:13, lineHeight:1.6 }}>
          <strong>Connection Error:</strong><br />{error}
        </div>
      ) : (
        <div style={{ display:"flex", alignItems:"center", gap:10, color:"rgba(255,255,255,0.7)", fontSize:14 }}>
          <div style={{ width:18, height:18, border:"2px solid rgba(255,255,255,0.3)", borderTop:"2px solid white", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
          Connecting to Supabase…
        </div>
      )}
    </div>
  );
}
