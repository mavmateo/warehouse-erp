import { useState } from "react";
import { dbRpc } from "@/lib/api";
import { today } from "@/lib/utils";

const SCHEMA_CTX = `
PostgreSQL (Supabase) database for a Ghana used clothing bale shop:

  products(id, name, sku, category, buy_price, sell_price, stock, unit, reorder_level, supplier)
    categories: Bedding, Children, Women, Men, Household, Mixed

  sales(id, sale_date DATE, customer, payment_method, total)
    payment_method: 'Cash' | 'MoMo' | 'Bank Transfer' | 'Credit'

  sale_items(id, sale_id, product_id, product_name, quantity, unit_price)

  expenses(id, expense_date DATE, description, amount, category)
    categories: Rent, Utilities, Wages, Transport, Stock Purchase, Maintenance, Marketing

  suppliers(id, name, phone, address, balance, last_order DATE)
    balance = amount owed to supplier

Currency: Ghana Cedis (GH₵). Today: ${today()}.
`;

const EXAMPLES = [
  "Which bale type has the highest profit margin?",
  "Show total sales grouped by payment method",
  "Which products need restocking soon?",
  "Total expenses by category",
  "Revenue vs cost per bale category",
  "Which supplier am I owing the most?",
  "Show me the 3 best-selling bales",
  "What is total revenue this month?",
];

interface QueryResult {
  sql:  string;
  cols: string[];
  rows: Record<string, unknown>[];
  err:  string | null;
}

interface HistoryEntry { question: string; sql: string; n: number; ts: string; }

export function QueryPanel() {
  const [q,       setQ]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const run = async (question = q) => {
    if (!question.trim() || loading) return;
    setLoading(true); setResult(null);
    try {
      const aiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string;
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": aiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          system: `You are a PostgreSQL expert for a Ghana clothing bale shop on Supabase.
Convert natural language to a PostgreSQL SELECT query.

${SCHEMA_CTX}

RULES:
- Output ONLY raw SQL — no markdown, no backticks, no explanation
- Only SELECT or WITH…SELECT (never INSERT/UPDATE/DELETE/DROP)
- Use readable column aliases
- ROUND numeric results to 2 decimal places
- For profit margin: ROUND((sell_price - buy_price) / NULLIF(buy_price,0) * 100, 1) AS margin_pct`,
          messages: [{ role: "user", content: question }],
        }),
      });
      const aiJson = await aiRes.json();
      const sql = ((aiJson.content?.[0]?.text as string) ?? "").trim().replace(/```sql|```/gi, "").trim();
      if (!sql) throw new Error("AI returned an empty response");

      const rows = await dbRpc<Record<string, unknown>[]>("run_query", { sql });
      const cols = rows?.length > 0 ? Object.keys(rows[0]) : [];

      setResult({ sql, cols, rows: rows ?? [], err: null });
      setHistory((prev) => [
        { question, sql, n: (rows ?? []).length, ts: new Date().toLocaleTimeString("en-GH", { hour:"2-digit", minute:"2-digit" }) },
        ...prev,
      ].slice(0, 10));
    } catch (e) {
      setResult({ sql: "", cols: [], rows: [], err: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const terminalHeader = (
    <div style={{ background:"var(--tb)",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:12 }}>
      <div style={{ display:"flex",gap:5 }}>
        {["#FF5F57","#FEBC2E","#28C840"].map((c) => <div key={c} style={{ width:12,height:12,borderRadius:"50%",background:c }} />)}
      </div>
      <div style={{ fontFamily:"Space Mono",fontSize:12,color:"var(--tg)" }}>
        baleshop-gh=# <span style={{ opacity:.4 }}>Supabase · PostgreSQL 15 · eu-west-1</span>
      </div>
      <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:6 }}>
        <div style={{ width:7,height:7,borderRadius:"50%",background:"var(--tg)" }} />
        <span style={{ fontFamily:"Space Mono",fontSize:10,color:"var(--tg)",opacity:.7 }}>connected</span>
      </div>
    </div>
  );

  return (
    <div className="fade-up" style={{ display:"grid",gridTemplateColumns:"1fr 255px",gap:16,height:"calc(100vh - 130px)" }}>
      {/* LEFT */}
      <div style={{ display:"flex",flexDirection:"column",gap:12,minHeight:0 }}>
        {terminalHeader}

        {/* Input */}
        <div style={{ background:"var(--tb)",borderRadius:14,padding:18 }}>
          <div style={{ fontFamily:"Space Mono",fontSize:10,color:"var(--tg)",opacity:.55,marginBottom:10,letterSpacing:"1.5px" }}>
            -- ASK IN PLAIN ENGLISH · AI WRITES THE SQL · RUNS ON SUPABASE
          </div>
          <textarea value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void run(); } }}
            placeholder="e.g. Which bale type has the highest profit margin?"
            rows={3}
            style={{ background:"#161B22",border:"1.5px solid #30363D",borderRadius:10,padding:"12px 16px",color:"#E6EDF3",fontFamily:"Space Mono",fontSize:13,resize:"none",outline:"none",lineHeight:1.7,width:"100%" }}
          />
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10 }}>
            <span style={{ fontFamily:"Space Mono",fontSize:10,color:"#4A5568" }}>⌘ Enter to run</span>
            <button onClick={() => void run()} disabled={!q.trim() || loading}
              style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 18px",borderRadius:9,border:"none",background:!q.trim()||loading?"#21262D":"var(--tg)",color:!q.trim()||loading?"#4A5568":"#0D1117",fontFamily:"Space Mono",fontSize:12,fontWeight:700,cursor:q.trim()&&!loading?"pointer":"not-allowed",transition:"all .15s" }}>
              {loading
                ? <><div style={{ width:14,height:14,border:"2px solid rgba(0,0,0,0.2)",borderTop:"2px solid rgba(0,0,0,0.8)",borderRadius:"50%",animation:"spin .7s linear infinite" }} />Running…</>
                : <>▶ Run Query</>}
            </button>
          </div>
        </div>

        {/* Output */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",gap:10,minHeight:0 }}>
          {result ? (
            <>
              <div style={{ background:"var(--tb)",borderRadius:12,padding:"14px 18px",flexShrink:0 }}>
                <div style={{ fontFamily:"Space Mono",fontSize:10,color:"#4A5568",marginBottom:8,letterSpacing:"1.5px" }}>GENERATED SQL</div>
                <pre style={{ fontFamily:"Space Mono",fontSize:12,color:"#79C0FF",margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.8 }}>{result.sql || "-- (empty)"}</pre>
              </div>
              {result.err && (
                <div style={{ background:"#1A0A0A",border:"1px solid #7F1D1D",borderRadius:12,padding:"14px 18px",flexShrink:0 }}>
                  <div style={{ fontFamily:"Space Mono",fontSize:11,color:"#F87171",lineHeight:1.6 }}><strong>ERROR: </strong>{result.err}</div>
                </div>
              )}
              {!result.err && result.rows.length > 0 && (
                <div style={{ background:"var(--wh)",borderRadius:12,boxShadow:"var(--sh)",overflow:"hidden",flex:1,minHeight:0,display:"flex",flexDirection:"column" }}>
                  <div style={{ background:"#0D1117",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
                    <span style={{ fontFamily:"Space Mono",fontSize:11,color:"var(--tg)" }}>✓ {result.rows.length} row{result.rows.length!==1?"s":""} returned</span>
                    <span style={{ fontFamily:"Space Mono",fontSize:10,color:"#4A5568" }}>{result.cols.length} col{result.cols.length!==1?"s":""}</span>
                  </div>
                  <div style={{ overflowX:"auto",overflowY:"auto",flex:1 }} className="ts">
                    <table>
                      <thead><tr>{result.cols.map((c) => <th key={c} style={{ background:"#161B22",color:"var(--tg)",fontFamily:"Space Mono",fontSize:10,whiteSpace:"nowrap" }}>{c}</th>)}</tr></thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i}>{result.cols.map((c) => (
                            <td key={c} style={{ fontFamily:"Space Mono",fontSize:12,whiteSpace:"nowrap",borderBottom:"1px solid var(--crd)" }}>
                              {row[c] == null ? <span style={{ color:"var(--mu)",fontStyle:"italic",fontFamily:"DM Sans" }}>null</span> : String(row[c])}
                            </td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!result.err && result.rows.length === 0 && (
                <div style={{ background:"var(--tb)",borderRadius:12,padding:24,textAlign:"center" }}>
                  <span style={{ fontFamily:"Space Mono",fontSize:13,color:"#4A5568" }}>-- 0 rows returned</span>
                </div>
              )}
            </>
          ) : !loading && (
            <div style={{ flex:1,background:"var(--tb)",borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10 }}>
              <div style={{ fontSize:42,marginBottom:4 }}>🔍</div>
              <div style={{ fontFamily:"Space Mono",fontSize:14,color:"#4A5568" }}>Query your Supabase database</div>
              <div style={{ fontFamily:"Space Mono",fontSize:11,color:"#2D3748",textAlign:"center",maxWidth:300,lineHeight:1.8 }}>Ask any question in plain English.<br />AI writes PostgreSQL · Supabase runs it live.</div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT sidebar */}
      <div style={{ display:"flex",flexDirection:"column",gap:12,overflow:"auto" }}>
        <div style={{ background:"var(--wh)",borderRadius:14,padding:16,boxShadow:"var(--sh)" }}>
          <div style={{ fontFamily:"Playfair Display",fontSize:15,color:"var(--gr)",marginBottom:12 }}>💡 Example Queries</div>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => { setQ(ex); setTimeout(() => void run(ex), 50); }}
                style={{ background:"var(--cr)",border:"none",borderRadius:8,padding:"8px 10px",textAlign:"left",fontSize:12,color:"var(--tx)",cursor:"pointer",lineHeight:1.5,transition:"background .15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--crd)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cr)"; }}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div style={{ background:"var(--tb)",borderRadius:14,padding:16,flex:1 }}>
            <div style={{ fontFamily:"Space Mono",fontSize:10,color:"var(--tg)",marginBottom:12,letterSpacing:"1.5px" }}>QUERY HISTORY</div>
            <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
              {history.map((h, i) => (
                <div key={i} onClick={() => setQ(h.question)}
                  style={{ background:"#161B22",borderRadius:8,padding:"9px 11px",cursor:"pointer",border:"1px solid #21262D",transition:"border .15s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--tg)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#21262D"; }}>
                  <div style={{ fontSize:11,color:"#C9D1D9",lineHeight:1.5,marginBottom:4 }}>{h.question}</div>
                  <div style={{ display:"flex",justifyContent:"space-between" }}>
                    <span style={{ fontFamily:"Space Mono",fontSize:9,color:"var(--tg)" }}>{h.n} rows</span>
                    <span style={{ fontFamily:"Space Mono",fontSize:9,color:"#4A5568" }}>{h.ts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ background:"var(--tb)",borderRadius:12,padding:"12px 14px" }}>
          <div style={{ fontFamily:"Space Mono",fontSize:9,color:"#4A5568",marginBottom:8,letterSpacing:"1px" }}>DATABASE TABLES</div>
          {["products","sales","sale_items","expenses","suppliers"].map((t) => (
            <div key={t} style={{ display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:"1px solid #21262D" }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:"var(--tg)",flexShrink:0 }} />
              <span style={{ fontFamily:"Space Mono",fontSize:10,color:"#79C0FF" }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
