import { useRef } from "react";

interface UploadZoneProps {
  preview:   string | null;
  onFile:    (file: File) => void;
  onScan:    () => void;
  scanning:  boolean;
  error:     string | null;
}

export function UploadZone({ preview, onFile, onScan, scanning, error }: UploadZoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Drop zone */}
      <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
        onClick={() => !preview && fileRef.current?.click()}
        style={{ background:"var(--wh)", borderRadius:14, boxShadow:"var(--sh)", padding:32,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          gap:14, cursor: preview ? "default" : "pointer",
          border:"2px dashed var(--crd)", minHeight:220, position:"relative",
          transition:"border-color .2s" }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          style={{ display:"none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}/>

        {scanning ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ width:40, height:40, border:"3px solid var(--crd)", borderTop:"3px solid var(--grm)",
              borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 12px" }}/>
            <div style={{ fontFamily:"Playfair Display", fontSize:16, color:"var(--gr)" }}>Reading image…</div>
            <div style={{ fontSize:12, color:"var(--mu)", marginTop:4 }}>GLM-OCR + Claude are parsing your document</div>
          </div>
        ) : preview ? (
          <img src={preview} alt="Preview" style={{ maxWidth:"100%", maxHeight:200, borderRadius:8, objectFit:"contain" }}/>
        ) : (
          <>
            <div style={{ fontSize:48 }}>📷</div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"Playfair Display", fontSize:17, color:"var(--gr)", marginBottom:4 }}>Drop image here</div>
              <div style={{ fontSize:12, color:"var(--mu)" }}>or click to choose a photo · JPG, PNG · max 10MB</div>
            </div>
          </>
        )}
      </div>

      {/* Swap image button */}
      {preview && !scanning && (
        <button className="btn bgh" onClick={() => fileRef.current?.click()}
          style={{ fontSize:12, justifyContent:"center" }}>
          🔄 Use different image
        </button>
      )}

      {/* Scan button */}
      {preview && !scanning && (
        <button className="btn bg2" onClick={onScan}
          style={{ padding:"14px 20px", fontSize:15, justifyContent:"center", borderRadius:12 }}>
          🔍 Scan with GLM-OCR
        </button>
      )}

      {error && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10,
          padding:"10px 14px", fontSize:13, color:"var(--rd)" }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

// ── Collapsible raw OCR text ──────────────────────────────────────────────────
interface OcrPanelProps { text: string; }

export function OcrPanel({ text }: OcrPanelProps) {
  const [open, setOpen] = (window as any).__ocrOpen
    ? [(window as any).__ocrOpen, (window as any).__setOcrOpen]
    : [false, () => {}];

  // Use React state via a simple local trick — just inline it
  return <OcrPanelInner text={text} />;
}

import { useState } from "react";

export function OcrPanelInner({ text }: OcrPanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background:"var(--wh)", borderRadius:12, boxShadow:"var(--sh)", overflow:"hidden" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width:"100%", padding:"10px 14px", display:"flex", justifyContent:"space-between",
          alignItems:"center", background:"none", border:"none", cursor:"pointer",
          fontSize:12, fontWeight:600, color:"var(--mu)" }}>
        <span>📄 Raw OCR Text</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding:"0 14px 14px", fontSize:11, fontFamily:"Space Mono",
          lineHeight:1.8, color:"var(--tx)", whiteSpace:"pre-wrap",
          maxHeight:200, overflowY:"auto", borderTop:"1px solid var(--crd)" }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────
import { CONF_COLOR, CONF_BG, CONF_LABEL } from "./types";

export function ConfBadge({ confidence, notes }: { confidence: "high"|"medium"|"low"; notes?: string }) {
  return (
    <div style={{ background: CONF_BG[confidence], border:`1.5px solid ${CONF_COLOR[confidence]}30`,
      borderRadius:10, padding:"10px 14px" }}>
      <div style={{ fontSize:11, fontWeight:700, color: CONF_COLOR[confidence],
        textTransform:"uppercase", letterSpacing:".5px" }}>
        {CONF_LABEL[confidence]}
      </div>
      {notes && <div style={{ fontSize:12, color:"var(--mu)", marginTop:4 }}>{notes}</div>}
    </div>
  );
}

// ── Left sidebar used in review layout ───────────────────────────────────────
export function ReviewSidebar({
  preview, confidence, notes, ocrText,
}: { preview: string; confidence: "high"|"medium"|"low"; notes: string; ocrText: string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:"var(--wh)", borderRadius:14, padding:14, boxShadow:"var(--sh)" }}>
        <img src={preview} alt="Scanned" style={{ width:"100%", borderRadius:8, objectFit:"contain", maxHeight:240 }}/>
      </div>
      <ConfBadge confidence={confidence} notes={notes} />
      <OcrPanelInner text={ocrText} />
    </div>
  );
}

// ── Reusable done screen ──────────────────────────────────────────────────────
export function DoneScreen({ message, onAnother }: { message: string; onAnother: () => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"80px 0", gap:20, textAlign:"center" }}>
      <div style={{ fontSize:64 }}>✅</div>
      <div style={{ fontFamily:"Playfair Display", fontSize:26, color:"var(--gr)" }}>Saved!</div>
      <div style={{ fontSize:14, color:"var(--mu)", maxWidth:380 }}>{message}</div>
      <div style={{ display:"flex", gap:12, marginTop:8 }}>
        <button className="btn bp" onClick={onAnother}>📷 Scan Another</button>
        <button className="btn bgh" onClick={onAnother}>Done</button>
      </div>
    </div>
  );
}
