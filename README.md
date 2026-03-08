# 🧺 BaleShop GH — ERP SaaS Platform

A full-stack monorepo ERP system for Ghana used-clothing bale shops, built with React, Supabase (PostgreSQL), and an AI-powered SQL query panel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript |
| Backend | NestJS, TypeScript |
| Database | Supabase (PostgreSQL 15, eu-west-1) |
| Monorepo | pnpm workspaces + Turborepo |
| AI | Anthropic Claude (SQL generation) |
| Infra | Docker Compose (local), Vercel (frontend), Railway/Render (backend) |

---

## Project Structure

```
warehouse/
├── apps/
│   ├── frontend/          # React + Vite SPA
│   │   └── src/
│   │       ├── app/           # App root + router
│   │       ├── components/    # Shared UI components
│   │       │   ├── ui/        # Spin, Modal, Field, Loader
│   │       │   └── layout/    # Sidebar, Header
│   │       ├── features/      # Domain feature modules
│   │       │   ├── dashboard/
│   │       │   ├── sales/     # POS
│   │       │   ├── inventory/
│   │       │   ├── expenses/
│   │       │   ├── suppliers/
│   │       │   ├── reports/
│   │       │   └── query/     # AI SQL query panel
│   │       ├── hooks/         # useRefresh, etc.
│   │       ├── lib/           # supabase.ts, api.ts, utils.ts
│   │       └── styles/        # globals.css
│   └── backend/           # NestJS API (optional layer)
│       └── src/
│           ├── modules/   # accounting, inventory, sales, crm, hr, …
│           ├── config/
│           └── database/  # migrations, seeds
├── packages/
│   ├── types/             # Shared TypeScript domain types
│   ├── db/                # Supabase client + generated DB types
│   └── config/            # ESLint, Prettier, tsconfig base
├── infra/                 # Docker, Terraform, k8s
├── docs/                  # Architecture, API spec
└── .github/workflows/     # CI, deploy
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9 — `npm install -g pnpm`

### 1. Clone & install
```bash
git clone https://github.com/your-org/erp-saas-platform
cd warehouse
pnpm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Fill in your Supabase URL, anon key, and Anthropic API key
```

### 3. Run locally
```bash
pnpm dev                    # starts all apps via Turborepo
# or individually:
pnpm --filter @erp/frontend dev
pnpm --filter @erp/backend  dev
```

### 4. Build for production
```bash
pnpm build
```

---

## Supabase Project

- **Project:** `baleshop-gh`
- **Project ID:** `theqmgdegpotidrdhwqj`
- **Region:** `eu-west-1`
- **Dashboard:** https://supabase.com/dashboard/project/theqmgdegpotidrdhwqj

### Regenerate TypeScript types
```bash
pnpm db:generate
```

---

## Features

- 🏠 **Dashboard** — Today's sales, low-stock alerts, P&L summary
- 🛒 **POS** — Click-to-cart, cash/MoMo/bank payment, real-time stock update
- 📦 **Inventory** — CRUD bale types, category filter, margin calculation
- 💸 **Expenses** — Record & categorise shop expenses
- 🤝 **Suppliers** — Supplier cards with outstanding balance tracking
- 📊 **Reports** — P&L statement, top sellers, payment breakdown, inventory value
- 🔍 **AI Query** — Ask questions in plain English; Claude writes PostgreSQL, Supabase runs it

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).
