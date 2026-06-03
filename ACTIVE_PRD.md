# Active PRD — Single LLM Core Architecture (v3.0)
> Version: **3.0.0** | Architecture: Single LLM Core (GPT-4o)
> Last Updated: 2026-05-31
> Status: **PHASES 1-5 COMPLETE** | Phase 6 (QA) pending
> Last Updated: 2026-05-30

---

## Build Sequence Overview

| Module | Name | Status | Dependencies |
|--------|------|--------|--------------|
| 1 | Identity Handshake | ✅ COMPLETE | — |
| 1.1 | Auth Context Verification | ✅ COMPLETE | — |
| 1.2 | Cassandra Two-Layer Auth | ✅ COMPLETE | 1.1 |
| 1.3 | Property & Status Handshake | ✅ COMPLETE | 1.1 |
| 2 | Schema Handshake | ✅ COMPLETE | 1 |
| 2.1 | FMS DB Column Verification | ✅ COMPLETE | 1.2 |
| 2.2 | Mobile → FMS Mapping | ✅ COMPLETE | 2.1 |
| 3 | Serving Layer Mount | ✅ COMPLETE | 2 |
| 3.1 | Fastify Server Setup | ✅ COMPLETE | 2.2 |
| 3.2 | Health Endpoint Verification | ✅ COMPLETE | 3.1 |
| 4 | Orchestrator Mount | ✅ COMPLETE | 3 |
| 4.1 | Router Wiring | ✅ COMPLETE | 3.2 |
| 4.2 | API Client Integration | ✅ COMPLETE | 4.1 |
| 5 | QA Verification Loop | ✅ COMPLETE | 4 |

---

## PRD: Cassandra UI, SSE Streaming, and Data Architecture

### Phase 1: Server-Side SSE Refactor ✅
- [x] `master_loop.py` — `run_stream()` generator with `StreamChunk` events
- [x] `api_server.py` — `/chat/stream` SSE endpoint
- [x] Event types: `reasoning`, `tool_start`, `tool_result`, `validation`, `answer`, `citation`, `done`, `error`

### Phase 2: Response Style Engine ✅
- [x] `response.py` — `sanitize()` strips SQL, UUIDs, internal terms
- [x] `validation.py` — `CleanResponseCheck` fails answers with leaks
- [x] Two-layer defense: ValidationAgent catches leaks + ResponseAgent sanitizes output

### Phase 3: Mobile UI — Collapsible Reasoning Bubble ✅
- [x] `ReasoningBubble.tsx` — NEW component with animated dots + timeline
- [x] `cassandraStore.ts` — `reasoning` + `reasoningSteps` fields on ChatMessage
- [x] `chat.ts` — `SSEParser` with structured event parsing + `onReasoning` callback
- [x] `CassandraSessionModal.tsx` — Integrated reasoning bubble into chat flow

### Phase 4: State Gates ✅
- [x] Mobile — `orgId` guard + `propertyId` guard in `handleSend`
- [x] Server — `org_id` hard boundary check in `/chat/stream`
- [x] Fastify — `/cassandra/chat/stream` proxy with auth pre-handler

### Phase 5: Data Architecture — Router Wiring ✅
- [x] `server/src/index.ts` — `fastify.printRoutes()` on startup
- [x] `server/src/plugins/cassandra.ts` — `/cassandra/chat/stream` proxy route
- [x] Verified all modular routers mounted (health, auth, tickets, properties, cassandra, context)

### Phase 6: Integration & QA 🔄 PENDING
- [ ] E2E test: SSE stream emits correct event sequence
- [ ] E2E test: Reasoning bubble renders in UI
- [ ] E2E test: State gate blocks chat when `property_id` is missing
- [ ] Unit test: `ResponseAgent.sanitize()` strips SQL and UUIDs
- [ ] Unit test: `ValidationAgent` fails answers containing raw SQL
- [ ] Run full test suite (resolve port 3001 conflict)

### Phase 6.1: Ticket Persistence Fix ✅ COMPLETE (2026-05-31)
- [x] C0-10: Fastify forward photo_url to Python `/chat/stream`
- [x] C0-11: Python accept photo_url → OrchestratorContext → create_ticket tool
- [x] C0-12: Python INSERT ticket to FMS via Fastify `/tickets` endpoint
- [x] Fastify `/tickets` accepts `photo_before_url` in schema
- [x] `httpx>=0.27.0` added to `cassandra/requirements.txt`
- [ ] QA test: attach photo → send message → verify ticket persisted (pending)
- [ ] Production: replace in-memory tickets store with Supabase INSERT (pending)

---

## Column Mapping (Full — All Fixed)

| Mobile Type Field | FMS Column | Status | Module |
|---|---|---|---|
| `User.avatar` | `users.user_photo_url` | ✅ DONE | 1.3 |
| `User.role` | `organization_memberships.role` | ✅ DONE | 1.1 |
| `Ticket.createdBy` | `tickets.raised_by` | ✅ DONE | 1.3 |
| `Ticket.assignedTo` | `tickets.assigned_to` | ✅ DONE | — |
| `TicketStatus.waitlist` | NOT IN FMS | ✅ REMOVED | 1.3 |
| `TicketStatus.assigned` | NOT IN FMS | ✅ REMOVED | 1.3 |
| `InventoryItem.minQuantity` | `stock_items.min_threshold` | ✅ DONE | 1.3 |
| `SOPChecklistItem.order` | `sop_checklist_items.order_index` | ✅ DONE | 1.3 |

---

## Product Lead Sign-Off

- [x] Module 1.3.1: Property Store — signed off
- [x] Module 1.3.2: Ticket Status Enum — signed off
- [x] Module 1.3.3: Type-to-Schema Mapping — signed off
- [x] Module 1.3.4: Property Service org_id — signed off
- [x] Phase 1: SSE Refactor — signed off
- [x] Phase 2: Clean Response Contract — signed off
- [x] Phase 3: ReasoningBubble UI — signed off
- [x] Phase 4: State Gates — signed off
- [x] Phase 5: Router Wiring — signed off
- [ ] Phase 6: QA Verification — pending

---

## v3.0: Single LLM Core Architecture (2026-05-31)

### Architecture: One GPT-4o as Command Center

The 7 rule-based agents are **deleted**. Everything is now handled by GPT-4o
with function calling.

```
Mobile → Fastify → Python API Server → Query Queue → LLM Orchestrator (GPT-4o)
                                                              ↓
                                                      Tool Execution
                                                      (create_ticket, sql_query, etc.)
                                                              ↓
                                                      SSE Stream → Mobile
```

### Files Deleted (Universe B — Rule-Based Agents)
- `cassandra/agents/intent.py` — Replaced by GPT-4o classification
- `cassandra/agents/context.py` — Replaced by GPT-4o context
- `cassandra/agents/permission.py` — Replaced by GPT-4o authorization
- `cassandra/agents/retrieval.py` — Replaced by GPT-4o retrieval
- `cassandra/agents/reasoning.py` — Replaced by GPT-4o reasoning
- `cassandra/agents/validation.py` — Replaced by GPT-4o validation
- `cassandra/agents/response.py` — Replaced by GPT-4o response
- `cassandra/agents/__init__.py` — Deleted
- `cassandra/harness/role_gate.py` — Deleted
- `cassandra/harness/__init__.py` — Deleted
- `cassandra/orchestrator/master_loop.py` — Replaced by `llm/orchestrator.py`

### New Files (Single LLM Core)
- `cassandra/llm/__init__.py` — Package init
- `cassandra/llm/openai_client.py` — OpenAI GPT-4o client wrapper
- `cassandra/llm/orchestrator.py` — LLM Orchestrator (single command center)
- `cassandra/queue/__init__.py` — Package init
- `cassandra/queue/query_queue.py` — Background job queue
- `cassandra/orchestrator/__init__.py` — Shared types (Tool, ToolResult, OrchestratorContext)

### Key Design Decisions
1. **Single LLM Core**: GPT-4o classifies intent, decides tools, synthesizes answers
2. **Background Queue**: Queries queued, processed async, prevents LLM burnout
3. **Function Calling**: GPT-4o uses tool definitions for create_ticket, sql_query, etc.
4. **No Rule-Based Branching**: The LLM decides everything, harness executes
5. **Mobile Unchanged**: `/cassandra/chat/stream` SSE interface preserved

### Query Queue Design
- Background thread worker processes queries one at a time
- Queue smooths burst traffic
- SSE notifies client of: queued → processing → done/failed
- Max 1000 jobs, 1-hour TTL

### System Prompt (GPT-4o Instructions)
```
You are Cassandra, an AI assistant for a Facility Management System (FMS).

CRITICAL RULES:
1. TENANT SCOPE: Always include org_id in queries
2. PHOTO SUPPORT: Use photo_url in ticket creation
3. PROPERTY CONTEXT: Confirm property before creating tickets
4. NEVER expose raw SQL, UUIDs, or internal terms
```

### Tool Definitions (GPT-4o Function Calling)
- `create_ticket` — Create maintenance ticket
- `query_tickets` — List/search tickets
- `fetch_context` — Get user/org context
- `sql_query` — Execute SQL (with org_id enforcement)
- `enroll_voice` — Voice enrollment

### v3.0 Module Status
| Module | Name | Status |
|--------|------|--------|
| LLM Core | OpenAI client | ✅ COMPLETE |
| LLM Core | LLM Orchestrator | ✅ COMPLETE |
| Queue | Query Queue | ✅ COMPLETE |
| Queue | SSE streaming | ✅ COMPLETE |
| API | `/chat` endpoint | ✅ COMPLETE |
| API | `/chat/stream` SSE | ✅ COMPLETE |
| Tools | Tool imports fixed | ✅ COMPLETE |
| Tools | C0-11/C0-12/C0-16 preserved | ✅ COMPLETE |
| Env | `OPENAI_API_KEY` | ⚠️ REQUIRED |
| QA | E2E test: attach photo → create ticket | 🔄 PENDING |
| QA | Verify LLM generates correct SQL | 🔄 PENDING |
| QA | Verify queue prevents burst overload | 🔄 PENDING |
