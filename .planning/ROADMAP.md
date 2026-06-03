# ROADMAP.md — Cassandra 2.0: Unified Production Architecture

> Source: PRD retrieved from NotebookLM (Cassandra Lifecycle notebook)
> Generated: 2026-05-30

---

## Product Vision

Cassandra 2.0 is a **Voice Agentic Framework** for facility management. It is an operational intelligence layer that **Listens, Understands, Remembers, and Acts** — converting verbal commitments into a verifiable, structured record of truth.

**Primary mandate:** Transactional recall. The system must synthesize data from Supermemory (verbal commitments) and pgvector (ticket status) to answer questions like *"What is the status of the scrap removal?"* with full source citation.

---

## Phase Roadmap

| Phase | Milestone | Status | Scope |
|-------|-----------|--------|-------|
| **0** | Infrastructure & Foundation | ✅ COMPLETE | Fastify server, TypeScript, MCP behavioral rules |
| **1** | Auth + Session_start Handshake | ✅ COMPLETE | Expo → Cassandra two-layer auth (REST + WebSocket) |
| **2 | Voice Round-Trip (Audio pipe) | ⏳ PENDING | Real-time voice input → LLM → audio output pipe |
| **3** | Organization-scoped Supermemory clusters | ⏳ PENDING | Per-org conversational memory isolation via Supermemory.ai |
| **4** | pgvector Operational Data Fetch Tool | ✅ COMPLETE | SQL tool + vector similarity for structured queries |
| **5** | Voice Enrollment Flow | ⏳ PENDING | 10s voice sample → 512-dim embedding → voice_profiles table |
| **6** | Diarization + Speaker Matching | ⏳ PENDING | Match transcribed speech to known voice profiles |
| **7** | AssemblyAI Post-meeting Transcript Pipeline | ⏳ PENDING | Upload audio → AssemblyAI → store transcript in Supermemory |
| **8** | Auto Ticket Creation (Closing the loop) | ✅ COMPLETE | LLM → create ticket via /api/tickets |
| **9** | Admin Query Interface (Operational Intelligence) | ⏳ PENDING | Role-specific dashboards: Super Admin, Admin, PM, Tenant, MST |
| **10** | External Extensions (Google Meet Bot) | ⏳ PENDING | Join external meetings, capture transcripts automatically |

---

## Next Phase to Plan

**Phase 2: Voice Round-Trip (Audio Pipe)**

### Phase Goal
Enable real-time voice conversation between the mobile app and Cassandra's Single-LLM Command Center. Audio flows: mobile mic → server → LLM → response audio → mobile speaker.

### Deliverables
- WebSocket audio endpoint (`wss://host/ws/audio/{orgId}`) mounted in Fastify
- ElevenLabs streaming TTS for voice responses
- OpenAI-compatible voice input processing
- Audio session management (start, pause, end) tied to cassandra_token auth

### Scope
- Real-time audio streaming (not async voice messages)
- G711 μ-law / Opus codec support
- Session keepalive and reconnection handling
- Mobile-side audio recorder + player integration in Expo

### Hard Rules for this Phase
- Audio sessions require valid cassandra_token (from Phase 1 auth)
- org_id must be extracted from JWT and passed to audio session
- Fallback to text if audio pipe fails

---

## Architecture

### Single-LLM Command Center
- **Model:** GPT-4o (single reasoning model)
- SQL Engine, Search, RAG, Memory treated as **Tools**, NOT separate LLM instances
- Eliminates: prompt drift, high latency, mixed responses

### 20-Line Master Loop
```
Perception → Action → Observation → Self-Correction (max 3 iterations)
```
- LLM decides tool calls
- Harness (non-deciding) executes and feeds raw JSON back

### 7-Agent Functional Flow
1. **Intent Agent** — Extract intent, identify missing entities (property_id, etc.)
2. **Context Agent** — Map conversation into structured working memory
3. **Permission Agent** — Verify role + org_id before tool execution
4. **Data Retrieval Agent** — GraphRAG subgraphs + SQL tool calls
5. **Reasoning Agent** — Synthesize facts into a plan
6. **Validation Agent** — Check answer contract (no hallucinations, permissions verified)
7. **Response Agent** — Format final output, separate internal reasoning from user-visible response

### Dual Memory Architecture
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Conversational Memory | Supermemory.ai | Per-org semantic search of meeting transcripts & commitments |
| Operational Data | pgvector/Supabase | Per-org SQL + vector similarity on tickets, budgets, health |

### Multi-Tenancy HARD Boundary
- `org_id` extracted from JWT → determines isolated Supermemory cluster + pgvector namespace
- Cross-tenant leakage = **critical failure**
- Enforced at: HTTP layer, prompt construction, SQL generation

---

## Hard Rules (ALWAYS / NEVER)

### NEVER
- Assume `property_id` — ask for clarification if missing
- Use `avatar_url` — always use `user_photo_url`
- Use yesterday's year — always check injected timestamp
- Mix data across organizations
- Answer with partial context or fabricated values

### ALWAYS
- Include `organization_id` predicate in SQL at LLM level
- Verify data source (Supermemory vs SQL) before answering
- **Cite sources** in every answer (e.g., "ticket #114", "meeting on April 9th")
- Run mandatory validation loop (max 3 iterations) before user-facing response
- Inject `current_timestamp` to prevent date hallucinations

### GATE
- ALL `/chat` endpoints (including session creation) require valid JWT
- E2E tests must verify cross-tenant queries return 403 Forbidden at HTTP layer

---

## PRD Reference Case: Neelabh/Scrap Removal

The canonical use case driving all architecture decisions:

1. **Listen:** Tenant (Neelabh) + PM (Abhiram) conversation → basement scrap removal by April 11th
2. **Act:** Automatically generate Ticket #114 with correct property, priority, deadline
3. **Recall:** On April 11th — *"What is the status of the scrap removal?"* → synthesizes Supermemory (verbal commitment) + pgvector (Ticket #114 status)

This loop is the **measuring stick** for every phase completion criterion.

---

## Environment Variables (Required)

```
# Supabase
SUPABASE_URL, FMS_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# LLM / Voice
OPENAI_API_KEY, ANTHROPIC_API_KEY, KIMI_API_KEY
ELEVENLABS_API_KEY, ELEVENLABS_DEFAULT_VOICE=alloy

# Memory
SUPERMEMORY_API_KEY, SUPERMEMORY_ORG_ID_HEADER

# Cassandra
CASSANDRA_API_URL=http://localhost:3001
CASSANDRA_API_KEY

# Mobile
EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
```

---

## Database Schema Whitelist (SQL Agent Restricted To)

```
tickets, properties, locations, vendors, contracts, budgets
users, organizations, checklists, checklist_items
artifacts, transcripts, voice_profiles
organization_memberships, property_memberships
```

---

## Infrastructure Requirements

- `/health/live` — basic liveness check
- `/health/ready` — confirms DB + Orchestrator availability
- E2E tests: cross-tenant query → 403 Forbidden at HTTP layer
