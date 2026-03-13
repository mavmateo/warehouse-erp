#!/usr/bin/env node
/**
 * BaleShop GH — unified launcher
 * Starts the WhatsApp server + Vite frontend together.
 * Ctrl+C kills both cleanly.
 *
 * Usage:  node start.js
 */

const { spawn } = require("child_process");
const path      = require("path");

const ROOT    = __dirname;
const WA_DIR  = path.join(ROOT, "apps", "whatsapp-server");
const FE_DIR  = path.join(ROOT, "apps", "frontend");

const GREEN  = "\x1b[32m";
const AMBER  = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

function log(prefix, color, line) {
  process.stdout.write(`${color}${BOLD}[${prefix}]${RESET} ${line}\n`);
}

// ── Spawn a child process, pipe its output with a coloured prefix ─────────────
function spawnProcess(label, color, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    env: { ...process.env },
  });

  child.stdout.on("data", (d) =>
    d.toString().split("\n").filter(Boolean).forEach((l) => log(label, color, l)),
  );
  child.stderr.on("data", (d) =>
    d.toString().split("\n").filter(Boolean).forEach((l) => log(label, color, `${DIM}${l}${RESET}`)),
  );

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      log(label, color, `⚠️  exited with code ${code}`);
    }
  });

  return child;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${GREEN}🧺 BaleShop GH — starting servers…${RESET}\n`);

const processes = [];

// 1. WhatsApp server
const wa = spawnProcess("WhatsApp", GREEN, "node", ["index.js"], WA_DIR);
processes.push(wa);

// 2. Vite frontend (small delay so WA server logs appear first)
setTimeout(() => {
  const fe = spawnProcess("Frontend", CYAN, "pnpm", ["dev"], FE_DIR);
  processes.push(fe);
}, 800);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${AMBER}${BOLD}[Launcher] ${signal} received — shutting down…${RESET}`);

  processes.forEach((p) => {
    try {
      // Kill the process group so any grandchildren (Puppeteer/Chromium) die too
      process.kill(-p.pid, "SIGTERM");
    } catch {
      try { p.kill("SIGTERM"); } catch { /* already dead */ }
    }
  });

  // Force-kill after 5 s if anything is still running
  setTimeout(() => {
    processes.forEach((p) => {
      try { process.kill(-p.pid, "SIGKILL"); } catch { /* ignore */ }
    });
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit",    () => shutdown("exit"));
