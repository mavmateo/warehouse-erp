# Architecture Overview — BaleShop GH ERP

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser / Client                         │
│  apps/frontend  (React 19 + Vite + TypeScript)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │Dashboard │ │ POS/Sale │ │Inventory │ │ AI QueryPanel │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│         │ Supabase REST API (anon key)          │           │
│         │                                Anthropic API      │
└─────────┼────────────────────────────────────────┼──────────┘
          │                                        │
          ▼                                        ▼
┌─────────────────────┐              ┌──────────────────────┐
│  Supabase (cloud)   │              │  Anthropic Claude    │
│  PostgreSQL 15      │              │  claude-sonnet-4     │
│  PostgREST API      │              │  SQL generation      │
│  Row-Level Security │              └──────────────────────┘
│  Edge Functions     │
└──────────┬──────────┘
           │ (optional – future)
           ▼
┌──────────────────────┐
│  apps/backend        │
│  NestJS API          │
│  Business logic      │
│  Job queues (Redis)  │
└──────────────────────┘
```

## Package Dependency Graph

```
apps/frontend  ──► @erp/db ──► @supabase/supabase-js
               ──► @erp/types
               ──► @erp/config

apps/backend   ──► @erp/db
               ──► @erp/types
               ──► @erp/config

packages/db    ──► @erp/types
               ──► @supabase/supabase-js
```

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | Supabase (PostgreSQL 15) | Managed, free tier, PostgREST + RLS |
| Frontend framework | React 19 + Vite | Fast HMR, small bundle, familiar |
| Monorepo tool | pnpm + Turborepo | Fast installs, smart build caching |
| Type sharing | `@erp/types` package | Single source of truth for domain types |
| AI query | Anthropic Claude (frontend) | Direct API call; `run_query` RPC for safe execution |
| Auth | Supabase anon key (MVP) | Single-user shop; upgrade to Supabase Auth for multi-user |

## Module Map

| Frontend Feature | Backend Module | DB Table(s) |
|---|---|---|
| `features/dashboard` | — (reads multiple) | all |
| `features/sales` | `modules/sales` | sales, sale_items |
| `features/inventory` | `modules/inventory` | products |
| `features/expenses` | `modules/accounting` | expenses |
| `features/suppliers` | `modules/procurement` | suppliers |
| `features/reports` | `modules/accounting` | all |
| `features/query` | — (RPC) | all (read-only) |
