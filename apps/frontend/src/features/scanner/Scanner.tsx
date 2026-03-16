import { useState } from "react";
import { SCAN_TYPES, type ScanType, type Phase } from "./types";
import { UploadZone } from "./shared";
import { SalesReviewer }     from "./SalesReviewer";
import { ExpensesReviewer }  from "./ExpensesReviewer";
import { InventoryReviewer } from "./InventoryReviewer";
import { CustomersReviewer } from "./CustomersReviewer";

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function Scanner({ onRefresh }: { onRefresh: () => void }) {
  const [scanType,   setScanType]   = useState<ScanType | null>(null);
  const [phase,      setPhase]      = useState<Phase>("idle");
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgBase64,  setImgBase64]  = useState<string | null>(null);
  const [ocrText,    setOcrText]    = useState("");
  const [parsed,     setParsed]     = useState<Record<string, unknown> | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Please upload an image file (JPG or PNG)"); return; }

    // Compress + resize to max 1600px / 0.85 quality before sending
    // This keeps the image well under 1MB and prevents edge function timeouts
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(objectUrl);
      setImgPreview(compressed);
      setImgBase64(compressed);
      setError(null);
    };
    img.src = objectUrl;
  };

  const scan = async () => {
    if (!imgBase64 || !scanType) return;
    setPhase("scanning"); setError(null);
    try {
      const res  = await fetch(`${SB_URL}/functions/v1/scan-receipt`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
        body:    JSON.stringify({ image: imgBase64, type: scanType }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setOcrText("");   // Gemini processes image directly — no separate OCR text
      setParsed(json.data);
      setPhase("review");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const reset = () => {
    setPhase("idle"); setImgPreview(null); setImgBase64(null);
    setOcrText(""); setParsed(null); setError(null);
    // Keep scanType so user can scan another of the same type
  };

  const fullReset = () => { reset(); setScanType(null); };

  const selected = SCAN_TYPES.find((t) => t.id === scanType);

  return (
    <div className="fade-up">

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>
            {selected ? `${selected.icon} Scan ${selected.label}` : "📷 Scanner"}
          </h2>
          <p style={{ color:"var(--mu)", fontSize:13 }}>
            {selected
              ? `Upload a photo — AI reads it and imports the data automatically`
              : "Choose what you want to scan, then upload an image"}
          </p>
        </div>
        {(scanType || phase !== "idle") && (
          <div style={{ display:"flex", gap:8 }}>
            {phase === "review" && <button className="btn bgh" onClick={reset}>← Rescan</button>}
            <button className="btn bgh" onClick={fullReset}>✕ New Scan</button>
          </div>
        )}
      </div>

      {/* ── Type picker ── */}
      {!scanType && (
        <div>
          <p style={{ fontSize:13, color:"var(--mu)", marginBottom:16 }}>What are you scanning?</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            {SCAN_TYPES.map((t) => (
              <button key={t.id} onClick={() => setScanType(t.id)}
                style={{ background:"var(--wh)", borderRadius:16, padding:"28px 20px", boxShadow:"var(--sh)",
                  border:"2px solid transparent", cursor:"pointer", textAlign:"left",
                  transition:"all .15s", display:"flex", flexDirection:"column", gap:10 }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--am)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}>
                <div style={{ fontSize:38 }}>{t.icon}</div>
                <div>
                  <div style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--gr)", marginBottom:4 }}>{t.label}</div>
                  <div style={{ fontSize:12, color:"var(--mu)", lineHeight:1.5, marginBottom:8 }}>{t.desc}</div>
                  <div style={{ fontSize:11, color:"var(--am)", background:"#FFF7ED", padding:"4px 8px", borderRadius:6, lineHeight:1.5 }}>
                    {t.hint}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload + scan ── */}
      {scanType && (phase === "idle" || phase === "scanning") && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <UploadZone
            preview={imgPreview}
            onFile={handleFile}
            onScan={scan}
            scanning={phase === "scanning"}
            error={error}
          />

          {/* Tips card */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"var(--wh)", borderRadius:16, padding:24, boxShadow:"var(--sh)" }}>
              <h4 style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--gr)", marginBottom:14 }}>
                💡 Tips for {selected?.label}
              </h4>
              {[
                ["Good lighting", "Avoid shadows across the text"],
                ["Flat & straight", "Lay the paper flat, phone directly above"],
                ["Full page", "Capture everything including totals and headers"],
                ["Clear writing", "Works best with printed or neat handwriting"],
              ].map(([title, desc]) => (
                <div key={title} style={{ display:"flex", gap:10, marginBottom:10 }}>
                  <span style={{ color:"var(--grm)", fontWeight:700, marginTop:1 }}>✓</span>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{title}</div>
                    <div style={{ fontSize:12, color:"var(--mu)" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:"#F0FDF4", borderRadius:14, padding:18, border:"1px solid #BBF7D0" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#065F46", marginBottom:6 }}>
                {selected?.icon} What to include in your image
              </div>
              <div style={{ fontSize:12, color:"#166534", lineHeight:1.8 }}>{selected?.hint}</div>
            </div>

            {/* Switch type */}
            <div style={{ background:"var(--wh)", borderRadius:12, padding:16, boxShadow:"var(--sh)" }}>
              <div style={{ fontSize:12, color:"var(--mu)", fontWeight:600, marginBottom:10 }}>Scan a different type instead:</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {SCAN_TYPES.filter((t) => t.id !== scanType).map((t) => (
                  <button key={t.id} onClick={() => { setScanType(t.id); setError(null); }}
                    style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid var(--crd)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Review phase: route to correct reviewer ── */}
      {phase === "review" && parsed && scanType === "sales" && (
        <SalesReviewer raw={parsed} ocrText={ocrText} preview={imgPreview!} onReset={reset} onSaved={onRefresh} />
      )}
      {phase === "review" && parsed && scanType === "expenses" && (
        <ExpensesReviewer raw={parsed} ocrText={ocrText} preview={imgPreview!} onReset={reset} onSaved={onRefresh} />
      )}
      {phase === "review" && parsed && scanType === "inventory" && (
        <InventoryReviewer raw={parsed} ocrText={ocrText} preview={imgPreview!} onReset={reset} onSaved={onRefresh} />
      )}
      {phase === "review" && parsed && scanType === "customers" && (
        <CustomersReviewer raw={parsed} ocrText={ocrText} preview={imgPreview!} onReset={reset} onSaved={onRefresh} />
      )}
    </div>
  );
}
