import { useState, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { dbPost } from "@/lib/api";

/* ── types ─────────────────────────────────────── */
interface SaleItem {
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface ExtractedSale {
  sale_date: string;
  customer: string;
  payment_method: string;
  notes: string;
  items: SaleItem[];
  total: number;
}

type Step = "upload" | "extracting" | "parsing" | "review" | "saving" | "done";

/* ── Claude text-parsing prompt ─────────────────── */
function buildParsePrompt(ocrText: string): string {
  return `You are an ERP data assistant for a used clothing bale shop in Ghana.
Below is raw OCR text extracted from a handwritten or printed daily sales record.
Parse it and return a single JSON object. Return ONLY the JSON — no preamble, no markdown fences.

OCR TEXT:
"""
${ocrText}
"""

Target schema:
{
  "sale_date": "YYYY-MM-DD",
  "customer": "customer name or 'Walk-in'",
  "payment_method": "Cash | Mobile Money | Credit | Bank Transfer",
  "notes": "any extra context",
  "items": [
    { "product_name": "string", "quantity": number, "unit_price": number }
  ],
  "total": number
}

Rules:
- If multiple sales are present, extract the first/most prominent one.
- Compute total from items if not explicitly written (sum of quantity x unit_price).
- Default customer to "Walk-in", payment to "Cash", date to today's date if missing.
- Quantities and prices must be plain numbers (no currency symbols or commas).
- Fix obvious OCR errors (e.g. "l" read as "1", "O" as "0") using context.`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/* ══════════════════════════════════════════════════
   Component
══════════════════════════════════════════════════ */
export function SalesScanner() {
  const [step, setStep]                 = useState<Step>("upload");
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrText, setOcrText]           = useState<string>("");
  const [ocrProgress, setOcrProgress]   = useState(0);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saleData, setSaleData]         = useState<ExtractedSale | null>(null);
  const [saveError, setSaveError]       = useState<string | null>(null);
  const [savedSaleId, setSavedSaleId]   = useState<number | null>(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [showRawOcr, setShowRawOcr]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── file handling ── */
  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setExtractError(null);
    setSaleData(null);
    setOcrText("");
    setOcrProgress(0);
    setStep("upload");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  /* ── STEP 1: Tesseract OCR ── */
  const runOcr = async (): Promise<string> => {
    if (!imageFile) throw new Error("No image file");
    setStep("extracting");
    setOcrProgress(0);

    const worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          setOcrProgress(Math.round((m.progress ?? 0) * 100));
        }
      },
    });

    try {
      const { data: { text } } = await worker.recognize(imageFile);
      await worker.terminate();
      return text;
    } catch (err) {
      await worker.terminate();
      throw err;
    }
  };

  /* ── STEP 2: Claude parses OCR text ── */
  const parseWithClaude = async (rawText: string): Promise<ExtractedSale> => {
    setStep("parsing");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: buildParsePrompt(rawText) }],
      }),
    });

    const data  = await res.json();
    const raw   = (data.content as { text?: string }[])?.map(b => b.text ?? "").join("") ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed: ExtractedSale = JSON.parse(clean);

    if (!parsed.total || parsed.total === 0)
      parsed.total = (parsed.items ?? []).reduce((s, i) => s + (i.quantity ?? 0) * (i.unit_price ?? 0), 0);
    if (!parsed.sale_date) parsed.sale_date = today();

    return parsed;
  };

  /* ── combined extract ── */
  const handleExtract = async () => {
    setExtractError(null);
    try {
      const raw = await runOcr();
      setOcrText(raw);
      if (!raw.trim()) throw new Error("No text detected. Try a clearer or higher-resolution photo.");
      const parsed = await parseWithClaude(raw);
      setSaleData(parsed);
      setStep("review");
    } catch (err) {
      setExtractError((err as Error).message || "Extraction failed — please try again.");
      setStep("upload");
      console.error(err);
    }
  };

  /* ── item helpers ── */
  const updateItem = (idx: number, field: keyof SaleItem, value: string) => {
    setSaleData(prev => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) =>
        i !== idx ? item : { ...item, [field]: field === "product_name" ? value : parseFloat(value) || 0 }
      );
      return { ...prev, items, total: items.reduce((s, i) => s + i.quantity * i.unit_price, 0) };
    });
  };

  const addItem = () =>
    setSaleData(prev => prev ? { ...prev, items: [...prev.items, { product_name: "", quantity: 1, unit_price: 0 }] } : prev);

  const removeItem = (idx: number) =>
    setSaleData(prev => {
      if (!prev) return prev;
      const items = prev.items.filter((_, i) => i !== idx);
      return { ...prev, items, total: items.reduce((s, i) => s + i.quantity * i.unit_price, 0) };
    });

  /* ── save ── */
  const saveSale = async () => {
    if (!saleData) return;
    setStep("saving");
    setSaveError(null);
    try {
      const [sale] = await dbPost<{ id: number }[]>("/sales", {
        sale_date:      saleData.sale_date,
        customer:       saleData.customer,
        payment_method: saleData.payment_method,
        total:          saleData.total,
      });
      await dbPost("/sale_items", saleData.items.map(item => ({
        sale_id: sale.id, product_name: item.product_name,
        quantity: item.quantity, unit_price: item.unit_price,
      })));
      setSavedSaleId(sale.id);
      setStep("done");
    } catch (err) {
      setSaveError("Save failed: " + (err as Error).message);
      setStep("review");
    }
  };

  const reset = () => {
    setStep("upload"); setImageFile(null); setImagePreview(null);
    setSaleData(null); setSaveError(null); setSavedSaleId(null);
    setExtractError(null); setOcrText(""); setOcrProgress(0);
  };

  const stepOrder: Step[] = ["upload", "extracting", "parsing", "review", "saving", "done"];
  const stepLabels: Record<Step, string> = { upload: "Upload", extracting: "OCR", parsing: "Parsing", review: "Review", saving: "Saving", done: "Done" };
  const currentIdx = stepOrder.indexOf(step);

  /* ══ render ══════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--ff-head)", fontSize: 22, fontWeight: 700, margin: 0, color: "var(--ct)" }}>
          Sales Image Scanner
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--cm)" }}>
          Photo → Tesseract OCR → Claude structures data → saved to ERP
        </p>
      </div>

      {/* step tracker */}
      <div style={{ display: "flex", gap: 4, marginBottom: 32 }}>
        {stepOrder.map((s, idx) => {
          const isActive = s === step, isComplete = currentIdx > idx;
          return (
            <div key={s} style={{
              flex: 1, padding: "8px 6px", fontSize: 10, letterSpacing: "0.07em",
              textTransform: "uppercase", fontFamily: "var(--ff-mono, monospace)",
              background: isComplete ? "var(--success-bg,#e8f5e9)" : isActive ? "var(--ca)" : "var(--cs)",
              color: isComplete ? "var(--success,#2e7d32)" : isActive ? "#fff" : "var(--cm)",
              borderRadius: 4, textAlign: "center", fontWeight: 600, transition: "all 0.2s",
            }}>
              {isComplete ? "✓ " : ""}{stepLabels[s]}
            </div>
          );
        })}
      </div>

      {/* ══ UPLOAD ══ */}
      {step === "upload" && (
        <div style={{ display: "grid", gridTemplateColumns: imagePreview ? "280px 1fr" : "1fr", gap: 24 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? "var(--ca)" : "var(--cb,#ddd)"}`,
              borderRadius: 8, padding: imagePreview ? 0 : "64px 32px",
              textAlign: "center", cursor: "pointer",
              background: isDragging ? "var(--ca-light,#f0f7ff)" : "var(--cs)",
              transition: "all 0.2s", overflow: "hidden",
            }}
          >
            {imagePreview
              ? <img src={imagePreview} alt="Sales record" style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 400 }} />
              : <>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <div style={{ fontWeight: 600, color: "var(--ct)", marginBottom: 6, fontSize: 14 }}>Drop sales image here</div>
                  <div style={{ fontSize: 12, color: "var(--cm)" }}>or click to browse · JPG, PNG, HEIC supported</div>
                </>
            }
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files?.[0])} />
          </div>

          {imagePreview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 12, color: "var(--cm)" }}>📎 {imageFile?.name}</div>
              <div style={{ background: "var(--cs)", border: "1px solid var(--cb)", borderRadius: 6, padding: "12px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--cm)", marginBottom: 10 }}>How it works</div>
                {[
                  ["1", "Tesseract OCR", "Reads text from your image entirely in-browser — nothing uploaded"],
                  ["2", "Claude AI",     "Structures the raw OCR text into fields and line items"],
                  ["3", "Review",        "You confirm or edit before anything is saved"],
                  ["4", "ERP Save",      "Written to your Supabase sales & sale_items tables"],
                ].map(([n, title, desc]) => (
                  <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--ca)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ct)" }}>{title}</div>
                      <div style={{ fontSize: 11, color: "var(--cm)" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={handleExtract}
                style={{ padding: "14px 24px", fontSize: 13, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                ⚡ Extract Sales Data
              </button>
              <button className="btn-ghost" onClick={reset} style={{ fontSize: 12 }}>↩ Choose a different image</button>
              {extractError && <ErrorBox msg={extractError} />}
            </div>
          )}
        </div>
      )}

      {/* ══ OCR PROGRESS ══ */}
      {step === "extracting" && (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ct)", marginBottom: 20 }}>Reading image with Tesseract OCR…</div>
          <div style={{ maxWidth: 320, margin: "0 auto 12px", background: "var(--cb)", borderRadius: 100, height: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 100, background: "var(--ca)", width: `${ocrProgress}%`, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--cm)" }}>{ocrProgress}% complete</div>
        </div>
      )}

      {/* ══ PARSING ══ */}
      {step === "parsing" && (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🤖</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ct)", marginBottom: 8 }}>Claude is structuring the extracted text…</div>
          <div style={{ fontSize: 12, color: "var(--cm)" }}>Parsing items, prices, and sale details</div>
          <div style={{ marginTop: 20 }}><Spinner size={28} /></div>
        </div>
      )}

      {/* ══ REVIEW ══ */}
      {step === "review" && saleData && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 28, alignItems: "start" }}>
          <div style={{ position: "sticky", top: 16 }}>
            <img src={imagePreview!} alt="Source" style={{ width: "100%", borderRadius: 6, border: "1px solid var(--cb)", display: "block" }} />
            <p style={{ fontSize: 11, color: "var(--cm)", margin: "6px 0 8px", textAlign: "center" }}>Source document</p>
            <button className="btn-ghost" onClick={() => setShowRawOcr(v => !v)}
              style={{ width: "100%", fontSize: 11, padding: "6px 0", justifyContent: "center", display: "flex" }}>
              {showRawOcr ? "▲ Hide" : "▼ Show"} raw OCR text
            </button>
            {showRawOcr && ocrText && (
              <pre style={{ marginTop: 8, padding: "10px 12px", background: "var(--cs)", border: "1px solid var(--cb)", borderRadius: 6, fontSize: 10, color: "var(--cm)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", fontFamily: "var(--ff-mono, monospace)" }}>
                {ocrText}
              </pre>
            )}
          </div>

          <div>
            <SectionLabel>Sale Details</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
              <Field label="Sale Date">
                <input type="date" className="erp-input" value={saleData.sale_date ?? ""}
                  onChange={e => setSaleData(p => p ? { ...p, sale_date: e.target.value } : p)} />
              </Field>
              <Field label="Customer">
                <input type="text" className="erp-input" value={saleData.customer ?? ""}
                  onChange={e => setSaleData(p => p ? { ...p, customer: e.target.value } : p)} />
              </Field>
              <Field label="Payment Method">
                <select className="erp-input" value={saleData.payment_method ?? "Cash"}
                  onChange={e => setSaleData(p => p ? { ...p, payment_method: e.target.value } : p)}>
                  <option>Cash</option><option>Mobile Money</option><option>Credit</option><option>Bank Transfer</option>
                </select>
              </Field>
              <Field label="Notes">
                <input type="text" className="erp-input" value={saleData.notes ?? ""} placeholder="Optional…"
                  onChange={e => setSaleData(p => p ? { ...p, notes: e.target.value } : p)} />
              </Field>
            </div>

            <SectionLabel>Line Items</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <thead>
                <tr>{["Product", "Qty", "Unit Price (GHS)", "Subtotal", ""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--cm)", background: "var(--cs)", borderBottom: "1px solid var(--cb)", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {saleData.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--cb)" }}>
                    <td style={{ padding: "4px 6px" }}>
                      <input className="erp-input" type="text" value={item.product_name} placeholder="Product name" style={{ minWidth: 140 }}
                        onChange={e => updateItem(idx, "product_name", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 6px", width: 80 }}>
                      <input className="erp-input" type="number" value={item.quantity} min={1}
                        onChange={e => updateItem(idx, "quantity", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 6px", width: 130 }}>
                      <input className="erp-input" type="number" value={item.unit_price} min={0} step="0.01"
                        onChange={e => updateItem(idx, "unit_price", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 12px", fontSize: 13, color: "var(--cm)", width: 100 }}>
                      {(item.quantity * item.unit_price).toFixed(2)}
                    </td>
                    <td style={{ padding: "4px 6px", width: 40 }}>
                      <button onClick={() => removeItem(idx)} style={{ background: "none", border: "1px solid var(--cb)", color: "var(--cm)", cursor: "pointer", fontSize: 11, padding: "2px 7px", borderRadius: 3 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn-ghost" onClick={addItem} style={{ fontSize: 12, marginBottom: 20 }}>+ Add item</button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "var(--cs)", borderRadius: 6, border: "1px solid var(--cb)" }}>
              <span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--cm)", fontWeight: 600 }}>Total</span>
              <span style={{ fontFamily: "var(--ff-head)", fontSize: 22, fontWeight: 700, color: "var(--ca)" }}>
                GHS {Number(saleData.total ?? 0).toFixed(2)}
              </span>
            </div>

            {saveError && <ErrorBox msg={saveError} />}

            <div style={{ display: "flex", gap: 12, marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--cb)" }}>
              <button className="btn-primary" onClick={saveSale} style={{ flex: 1, padding: "13px 0", fontSize: 13, justifyContent: "center", display: "flex" }}>
                ✓ Save to ERP
              </button>
              <button className="btn-ghost" onClick={reset} style={{ fontSize: 12 }}>↩ Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SAVING ══ */}
      {step === "saving" && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ marginBottom: 16 }}><Spinner size={36} /></div>
          <p style={{ fontSize: 13, color: "var(--cm)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Saving to ERP…</p>
        </div>
      )}

      {/* ══ DONE ══ */}
      {step === "done" && (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h3 style={{ fontFamily: "var(--ff-head)", fontSize: 20, margin: "0 0 8px", color: "var(--ct)" }}>Sale recorded successfully</h3>
          <p style={{ color: "var(--cm)", fontSize: 13, margin: "0 0 4px" }}>Saved via Tesseract + Claude pipeline</p>
          {savedSaleId && (
            <div style={{ display: "inline-block", margin: "12px auto 28px", background: "var(--success-bg,#e8f5e9)", border: "1px solid var(--success-border,#a5d6a7)", color: "var(--success,#2e7d32)", padding: "6px 18px", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              Sale #{savedSaleId}
            </div>
          )}
          <br />
          <button className="btn-primary" onClick={reset} style={{ padding: "12px 28px" }}>📋 Scan another record</button>
        </div>
      )}
    </div>
  );
}

/* ── helpers ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--cm)", fontWeight: 600, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--cb)" }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, color: "var(--cm)", letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return <div style={{ width: size, height: size, border: `${size > 20 ? 3 : 2}px solid var(--cb)`, borderTopColor: "var(--ca)", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />;
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ background: "var(--error-bg,#fdecea)", border: "1px solid var(--error-border,#f5c6cb)", color: "var(--error,#c62828)", padding: "10px 14px", borderRadius: 6, fontSize: 12, marginTop: 12 }}>{msg}</div>;
}
