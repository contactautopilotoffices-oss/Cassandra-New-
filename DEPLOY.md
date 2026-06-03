# Deploy Cassandra API to Render

## Overview

The Cassandra Python API runs as a **Web Service** on Render. It exposes the LLM orchestrator, SQL engine, and ticket tools to the mobile app.

**Service endpoint:** `https://cassandra-api.onrender.com` (example)  
**Health check:** `GET /health`

---

## Files

| File | Purpose |
|------|---------|
| `Procfile` | Tells Render how to start the service |
| `runtime.txt` | Pins Python to 3.12 (Render default) |
| `requirements.txt` | Python dependencies (root-level, Render requirement) |
| `render.yaml` | Infrastructure-as-Code blueprint |
| `cassandra/requirements.txt` | Source of truth (copied to root) |

---

## Prerequisites

1. **Render account** — [render.com](https://render.com)
2. **Git repo pushed** — This repo must be on GitHub/GitLab
3. **Supabase project** — FMS database (existing)
4. **OpenAI API key** — For GPT-4o-mini

---

## Deployment Steps

### Option A: Blueprint (Recommended)

1. In Render dashboard → **Blueprints** → **New Blueprint Instance**
2. Connect your Git repo
3. Select `render.yaml`
4. Render will create the service automatically
5. Go to **Environment** tab and add the **Required secrets** (see below)
6. Click **Deploy**

### Option B: Manual Web Service

1. Render dashboard → **New** → **Web Service**
2. Connect your Git repo
3. Configure:
   - **Name:** `cassandra-api`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `cd cassandra && uvicorn orchestrator.api_server:app --host 0.0.0.0 --port $PORT`
4. Add **Environment Variables** (see below)
5. Click **Create Web Service**

---

## Required Environment Variables

Set these in the Render dashboard → **Environment** tab.

| Variable | Source | Description |
|----------|--------|-------------|
| `FMS_SUPABASE_URL` | `.env.shared.local` → `EXPO_PUBLIC_SUPABASE_URL` | FMS/Expo Supabase project URL |
| `FMS_SUPABASE_SERVICE_ROLE_KEY` | `.env.shared.local` → `AUTH_SUPABASE_SERVICE_ROLE_KEY` | Service role key for direct DB access |
| `OPENAI_API_KEY` | `.env.shared.local` | OpenAI API key |
| `SUPABASE_JWT_SECRET` | `.env.shared.local` | JWT secret for token validation |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_MODEL` | `gpt-4o-mini` | LLM model |
| `OPENAI_TEMPERATURE` | `0.7` | Sampling temperature |
| `OPENAI_MAX_TOKENS` | `2048` | Max response tokens |
| `OPENAI_THINKING_BUDGET` | `10000` | Reasoning budget |
| `SESSION_TTL_SECONDS` | `21600` | Session expiry (6 hours) |

> **Note:** `PORT` is injected automatically by Render. Do not set it manually.

---

## Post-Deploy Checklist

1. **Health check** — Visit `https://<your-service>.onrender.com/health`
   ```json
   {"status":"ok","service":"cassandra","version":"3.1.0"}
   ```

2. **Update mobile app env** — Change `.env.shared.local` (or `.env` in mobile app):
   ```bash
   EXPO_PUBLIC_CASSANDRA_API_URL=https://cassandra-api-xxxxx.onrender.com
   EXPO_PUBLIC_CASSANDRA_WS_URL=wss://cassandra-api-xxxxx.onrender.com
   EXPO_PUBLIC_VOICE_API_URL=https://cassandra-api-xxxxx.onrender.com
   ```

3. **Rebuild mobile app** — `npx expo start --clear` to pick up new URL

4. **Test end-to-end** — Send a chat message in the app, verify response

---

## Auto-Schema Sync

The server auto-rebuilds `fms_schema.py` from `database.types.ts` on every startup. If you add a new table to Supabase:

```bash
# 1. Regenerate TypeScript types
npx supabase gen types typescript --project-id <project-id> > saas_mobile_app/types/database.types.ts

# 2. Commit & push
git add saas_mobile_app/types/database.types.ts
git commit -m "feat: add new table X"
git push

# 3. Render auto-deploys (if autoDeploy: true)
# The server restarts and picks up the new table automatically
```

No manual editing of `cassandra/tools/fms_schema.py` needed.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `ModuleNotFoundError: cassandra` | PYTHONPATH issue | `sys.path.insert` in `api_server.py` handles this; verify `Procfile` has `cd cassandra && ...` |
| `SQL_GUARD_BLOCKED` | Table not in whitelist | Regenerate `database.types.ts` and redeploy |
| `OPENAI_API_KEY missing` | Env var not set | Add `OPENAI_API_KEY` in Render dashboard |
| Slow cold start | Render free tier spins down | Upgrade to Starter ($7/mo) for always-on |
| WebSocket fails | Render free tier has WS limits | Use Starter plan; or switch to HTTP polling |

---

## Architecture on Render

```
Mobile App (iOS/Android)
    ↓ HTTPS / WSS
Render Web Service (cassandra-api)
    ├─ FastAPI (port $PORT)
    ├─ SQLite (chat sessions, local disk)
    ├─ OpenAI API (GPT-4o-mini)
    └─ Supabase REST (FMS database)
```

**SQLite note:** Chat sessions are stored in a local SQLite file (`cassandra_sessions.db`). On Render's ephemeral filesystem, this resets on every deploy. For production persistence, migrate to PostgreSQL or Supabase.
