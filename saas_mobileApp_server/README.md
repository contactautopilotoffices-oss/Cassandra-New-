# SaaS Mobile Server

This project is the new Vercel-hosted backend for the mobile app.

## Why this exists

The current mobile app uses a hybrid model:

- some features call Supabase directly from the client
- some features call web-style API endpoints

This server is the new long-term API boundary for:

- privileged operations
- workflow-heavy mutations
- AI classification
- multi-table writes
- admin/service-role actions
- reporting and audit-sensitive operations

## Current server shape

Implemented now:

- `GET /api/health`
- `GET /api/auth/property-access`
- `GET /api/tickets`
- `POST /api/tickets`
- shared bearer-token auth utilities
- shared Supabase anon/admin clients
- ticket AI classification pipeline copied from the web architecture

## Environment variables

See `.env.example`.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`

## Run locally

```bash
npm install
npm run dev
```

## Deployment target

Deploy this folder as the new Vercel project that will replace the current shared domain target.

See:

- [ARCHITECTURE_ANALYSIS.md](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile_server/ARCHITECTURE_ANALYSIS.md>)
- [DEPLOYMENT_STEPS.md](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile_server/DEPLOYMENT_STEPS.md>)
