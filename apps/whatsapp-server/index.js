const express    = require("express");
const cors       = require("cors");
const qrcode     = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── State ─────────────────────────────────────────────────────────────────────
let state       = "initialising"; // initialising | qr | ready | disconnected | auth_failure
let qrDataUrl   = null;           // base64 PNG of QR for browser display
let qrRawString = null;           // raw QR string (for debugging)

// ── WhatsApp client ───────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("📱 QR code received — scan with WhatsApp to connect");
  qrRawString = qr;
  state       = "qr";
  try {
    qrDataUrl = await qrcode.toDataURL(qr, { width: 280, margin: 2 });
  } catch (err) {
    console.error("QR generation error:", err);
  }
});

client.on("authenticated", () => {
  console.log("✅ WhatsApp authenticated");
  state     = "initialising";
  qrDataUrl = null;
});

client.on("auth_failure", (msg) => {
  console.error("❌ Auth failure:", msg);
  state     = "auth_failure";
  qrDataUrl = null;
});

client.on("ready", () => {
  console.log("🟢 WhatsApp client is ready");
  state     = "ready";
  qrDataUrl = null;
});

client.on("disconnected", (reason) => {
  console.warn("🔴 WhatsApp disconnected:", reason);
  state     = "disconnected";
  qrDataUrl = null;
});

// Initialise (non-blocking)
console.log("🚀 Starting WhatsApp client…");
client.initialize().catch((err) => {
  console.error("Client init error:", err.message);
  state = "disconnected";
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a Ghana / international phone number to WhatsApp format.
 * WhatsApp expects E.164 without the + prefix, e.g. 233244123456
 */
function normalisePhone(raw) {
  // Strip all non-digits
  let digits = raw.replace(/\D/g, "");

  // Ghana local format: 0244… → 233244…
  if (digits.startsWith("0") && digits.length === 10) {
    digits = "233" + digits.slice(1);
  }

  // If already starts with 233 and is 12 digits, good
  // Otherwise assume it's already in international format (just digits)
  return digits + "@c.us"; // WhatsApp chat ID format
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /status — returns connection state and QR if available
app.get("/status", (_req, res) => {
  res.json({
    status:  state,
    ready:   state === "ready",
    qr:      qrDataUrl ?? null,
    message: {
      initialising: "WhatsApp is starting up, please wait…",
      qr:           "Scan the QR code with your phone to connect",
      ready:        "WhatsApp is connected and ready",
      disconnected: "WhatsApp disconnected. Restart the server to reconnect.",
      auth_failure: "Authentication failed. Delete .wwebjs_auth folder and restart.",
    }[state] ?? "Unknown state",
  });
});

// POST /send — send messages to one or more recipients
// Body: { recipients: [{ name, phone }], message }
app.post("/send", async (req, res) => {
  if (state !== "ready") {
    return res.status(503).json({ error: `WhatsApp not ready. Current state: ${state}` });
  }

  const { recipients, message } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "No recipients provided" });
  }
  if (!message?.trim()) {
    return res.status(400).json({ error: "Message body is empty" });
  }

  const results = [];

  for (const r of recipients) {
    if (!r.phone) {
      results.push({ recipient: r.name, phone: null, success: false, error: "No phone number" });
      continue;
    }

    const chatId = normalisePhone(r.phone);

    try {
      // Check the number is registered on WhatsApp
      const isRegistered = await client.isRegisteredUser(chatId);
      if (!isRegistered) {
        results.push({ recipient: r.name, phone: r.phone, success: false, error: "Number not on WhatsApp" });
        continue;
      }

      await client.sendMessage(chatId, message);
      results.push({ recipient: r.name, phone: r.phone, success: true });

      // Small delay between messages to avoid spam detection
      await delay(1200);
    } catch (err) {
      results.push({ recipient: r.name, phone: r.phone, success: false, error: err.message });
    }
  }

  const sent   = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`📨 Sent: ${sent}, Failed: ${failed}`);
  res.json({ sent, failed, results });
});

// POST /disconnect — logout and clear session
app.post("/disconnect", async (_req, res) => {
  try {
    await client.logout();
    state = "disconnected";
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌍 WhatsApp server running at http://localhost:${PORT}`);
  console.log(`   GET  /status  — check connection state + get QR`);
  console.log(`   POST /send    — send messages`);
  console.log(`   POST /disconnect — logout`);
});
