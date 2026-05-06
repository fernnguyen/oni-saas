# ONI SaaS Starter

Monorepo SaaS starter for `oni.vn`.

## Structure
- `apps/web` – Next.js App Router (frontend + control-plane backend)
- `packages/core` – shared domain types and SQL schema
- `packages/adapters` – pluggable data connectors
- `packages/ui` – shared UI components for future extraction

## Core concepts
- Multi-tenant SaaS
- Custom domain per shop
- Role-based access control
- Pluggable adapters: Google Sheets, Supabase DB
- Onboarding: register tenant → create shop → connect provider → verify
