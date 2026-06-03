# Plan: Context Handshake Protocol — Autonomous RAG Dev Loop

## 1. Context Audit

**What already exists:**
- NotebookLM MCP is fully wired: `notebooklm` server active, 5 notebooks found
- Primary notebook: `1c103553-ec83-4d35-9ce4-78b7555b8c24` ("The Python Architecture of Claude Code") — 21 sources, last modified 2026-05-29
- Contains: FMS DB schema, Cassandra schema, server audit, product definitions, post-mortem docs, screenshots
- Claude Code settings: `.claude/settings.local.json` with NotebookLM MCP enabled
- Mobile app: 649 files, comprehensive service/store/type layer, auth context with membership caching, dual Cassandra auth (REST + WebSocket)
- Supermemory skill exists but not wired as MCP

**The critical gap — what must be built:**
- No `server/` directory (no local test runner, no QA endpoint)
- No `.claude/rules/` (no persistent behavioral rules for MCP memory)
- No PRD scaffolding files (`ACTIVE_PRD.md`, `TECHNICAL_SPEC.md`, `TEST_RESULTS.log`)
- No file watcher / trigger mechanism
- No state-etching between sessions

---

## 2. Architecture Decision: Hybrid Memory Model

Since NotebookLM is already configured and populated with the exact 21 sources we need, **we will NOT add Supermemory as an MCP** — that would be redundant. Instead:

| Memory Layer | Tool | Purpose |
|---|---|---|
| **Long-term (LTM)** | NotebookLM MCP | Schema truth, architecture docs, PRD history, post-mortems |
| **Short-term (STM)** | File-based state files | Active build state, current module, test results |
| **Agent Rules** | `.claude/rules/mcp-memory.md` | Behavioral constraints forcing MCP usage |

---

## 3. Implementation Phases

### Phase 1: Core Rules + PRD Scaffold (~15 min)
**Files to create:**
1. `.claude/rules/mcp-memory.md` — Behavioral rules file (permanent, survives sessions)
2. `ACTIVE_PRD.md` — Current target module spec
3. `TECHNICAL_SPEC.md` — Source of truth for schemas + env vars
4. `TEST_RESULTS.log` — Live QA log (append-only)

**Behavior enforced by rules:**
- **Session Start:** First action MUST be `notebooklm_notebook_query` with the initialization prompt
- **Stuck Detection:** Any error → must query NotebookLM before retrying, never guess
- **Session End:** Must write `Dev Spec Build Info` to NotebookLM before exiting

### Phase 2: NotebookLM Source Injection (~10 min)
Ingest these synthesized docs into NotebookLM (the LTM layer):
- `CASSANDRA_BUILD_LOG.md` — Module completion history
- `MOBILE_AUTH_ARCHITECTURE.md` — Current auth context + membership flow
- `SCHEMA_FIX_LOG.md` — All resolved vs. unresolved schema mismatches

### Phase 3: Minimal Server for QA (~30 min)
**Files to create:**
```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Fastify entry point (port 3001)
│   ├── routes/
│   │   ├── health.ts         # GET /health → "serving layer alive"
│   │   ├── auth.ts           # POST /auth/session (Cassandra token exchange mock)
│   │   └── tickets.ts        # GET/POST /tickets (mirrors mobile service calls)
│   └── tests/
│       └── integration.test.ts # QA checks via supertest
├── scripts/
│   └── watch-prd.ts          # File watcher → triggers Claude Code on PRD change
└── .env.example
```

**Why Fastify over Express:** TypeScript-first, matches existing mobile TS patterns, faster.

### Phase 4: Watcher + Trigger Script (~10 min)
- Python `watchdog` script watching `ACTIVE_PRD.md`
- On change: writes to `TRIGGER_NEXT.md`, logs timestamp to `TEST_RESULTS.log`
- Manual trigger command: `claude dev --execute "build_module.sh"`

---

## 4. Detailed Implementation

### 4.1 `.claude/rules/mcp-memory.md` (Permanent Agent Rules)

```markdown
# MCP Memory & Token Management Rules
# These rules are ENFORCED at the behavioral level — not suggestions.

## Rule 1: Session Start Handshake (MANDATORY)
At the START of EVERY session, before any code reading or writing:
1. Call notebooklm_notebook_query with:
   "Retrieve the current 'Source of Truth' including: (a) Master Loop logic,
   (b) verified DB schemas (FMS and Cassandra), (c) the status of the current
   Build Module (e.g., 1.1 Auth Handshake), (d) any unresolved errors from
   previous sessions, (e) the latest CASSANDRA_BUILD_LOG entries."
2. Read ACTIVE_PRD.md to understand the current target module.
3. Read TECHNICAL_SPEC.md to verify environment variables and table names.
4. ONLY AFTER steps 1-3: begin Perception phase.

## Rule 2: Stuck in Loop Protocol (MANDATORY)
If ANY of these occur, you MUST follow the self-correction sub-loop before retrying:
- HTTP 500/502/503 from any API call
- "table not found" or "column not found" in any response
- TypeScript compilation error referencing undefined types
- Any error with no clear root cause in the current file

The sub-loop:
1. OBSERVE: Identify the exact missing context (table name, column, env var)
2. QUERY: Call notebooklm_notebook_query for the specific technical detail
3. CORRECT: Inject the correct value from NotebookLM response
4. RETRY: Re-execute the failed operation
5. DOCUMENT: Write the fix to TEST_RESULTS.log

## Rule 3: Session Close Handshake (MANDATORY)
Before finishing ANY session:
1. Write a "Dev Spec Build Info" report to TEST_RESULTS.log:
   - Module status (1.1, 1.2 — Verified/Failed/In-Progress)
   - Environmental changes (.env keys added, routers mounted, ports changed)
   - Technical debts (orphaned code, network-layer ghosts, unresolved TODOs)
   - Next action for next session
2. Call notebooklm_notebook_add_text to append the build log entry to the
   CASSANDRA_BUILD_LOG notebook source (so it's in LTM for next session).

## Rule 4: Token Efficiency
- PREFER querying NotebookLM MCP over asking the user for context that exists
  in the 21 source documents.
- If you need to verify a table column name, ALWAYS check NotebookLM first.
- If you need to verify an API endpoint, ALWAYS check TECHNICAL_SPEC.md first.
- Only ask the user when: (a) NotebookLM doesn't have the answer, AND
  (b) the answer is not in any file in the monorepo.

## Rule 5: PRD-Driven Development
- NEVER start a module without reading ACTIVE_PRD.md first.
- NEVER skip QA verification — if tests fail, fix and re-run until pass.
- NEVER claim a module is "complete" without writing to TEST_RESULTS.log.
```

### 4.2 `ACTIVE_PRD.md`

```markdown
# Active PRD — Module 1: Identity Handshake

## Status: NOT STARTED
## Last Updated: 2026-05-29

---

## Module 1.1: Auth Context Verification
**Spec:**
- Verify AuthContext.tsx correctly fetches `organization_memberships` and `property_memberships`
- Ensure `getValidToken()` from `cassandraAuthService` is pre-warmed on SIGNED_IN
- Verify `org_id` and `property_id` are always present in membership state

**Non-Negotiable Rules:**
- Every Supabase query MUST include `organization_id` predicate for tenant scoping
- Cassandra token MUST be refreshed 5 minutes before expiry (REFRESH_BUFFER_SECONDS = 300)
- Membership cache TTL: 24 hours (not 5 minutes — mobile apps cache aggressively)

**QA Checklist:**
- [ ] Login flow: Supabase JWT → membership fetch → Cassandra token pre-warm
- [ ] Logout flow: clear membership cache + clear Cassandra token
- [ ] Org admin: auto-inject all org properties into membership
- [ ] Schema verification: `users.user_photo_url` (NOT `avatar_url`)

---

## Module 1.2: Cassandra Two-Layer Auth
**Spec:**
- Layer 1 (REST): Exchange Supabase JWT → Cassandra bearer token via POST /auth/session
- Layer 2 (WebSocket): Cassandra token injected in session_start JSON frame
- Token cached in SecureStore with 5-minute pre-refresh buffer

**Non-Negotiable Rules:**
- Token key: `cassandra_token`, expiry key: `cassandra_expires_at`
- 401 retry: re-exchange ONCE after clearing cache
- WebSocket URL: constructed from `org_id`, not hardcoded

**QA Checklist:**
- [ ] Verify `getValidToken()` returns valid token or re-exchanges
- [ ] Verify `withTokenRetry()` correctly handles 401
- [ ] Verify WebSocket URL format: `wss://[host]/ws/cassandra?org_id=[orgId]`
```

### 4.3 `TECHNICAL_SPEC.md`

```markdown
# Technical Spec — Source of Truth

## Environment Variables
| Key | Source | Notes |
|-----|--------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project | Used in `utils/supabase/client.ts` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase project | Used in `utils/supabase/client.ts` |
| `CASSANDRA_API_URL` | Cassandra server | Default: `http://localhost:3001` for local dev |
| `CASSANDRA_API_KEY` | Cassandra server | For token exchange endpoint |

## FMS DB Tables (Verified Correct)
### organization_memberships
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | FK → auth.users |
| organization_id | uuid | FK → organizations |
| role | text | org_super_admin, org_admin, owner, tenant |
| is_active | boolean | NULL = active |

### property_memberships
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | FK → auth.users |
| property_id | uuid | FK → properties |
| role | text | property_admin, tenant, mst, security_guard |

### users (application table)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, matches auth.users |
| email | text | From auth.users |
| full_name | text | NOT `name` |
| user_photo_url | text | NOT `avatar_url` |

## Cassandra Token Exchange
- Endpoint: `POST {CASSANDRA_API_URL}/auth/session`
- Body: `{ "token": "<supabase_jwt>" }`
- Response: `{ "token": "<cassandra_token>", "expires_at": "<iso_timestamp>" }`

## Critical Column Name Mapping (Mobile → FMS)
| Mobile Expects | FMS Actual | Status |
|---|---|---|
| avatar_url | user_photo_url | FIXED |
| created_by | raised_by | FIXED |
| before_photo | photo_before_url | FIXED |
| internal | is_internal | FIXED |
| min_quantity | min_threshold | FIXED |
```

### 4.4 `TEST_RESULTS.log` (Template)

```markdown
# TEST_RESULTS.log
# Format: [TIMESTAMP] | MODULE | TEST_NAME | STATUS | NOTES
# Status: PASS | FAIL | SKIP | IN_PROGRESS

## Session: 2026-05-29T00:00:00Z
```

---

## 5. File List (All New Files)

```
/Lohit Mobile App/
├── .claude/
│   └── rules/
│       └── mcp-memory.md          # NEW: Permanent agent behavior rules
├── ACTIVE_PRD.md                   # NEW: Current module spec
├── TECHNICAL_SPEC.md               # NEW: Schema + env source of truth
├── TEST_RESULTS.log                # NEW: Append-only QA log
├── CASSANDRA_BUILD_LOG.md          # NEW: NotebookLM ingest doc (LTM)
├── MOBILE_AUTH_ARCHITECTURE.md     # NEW: NotebookLM ingest doc (LTM)
└── server/                         # NEW: Minimal Fastify server
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── src/
    │   ├── index.ts
    │   ├── routes/
    │   │   ├── health.ts
    │   │   ├── auth.ts
    │   │   └── tickets.ts
    │   └── tests/
    │       └── integration.test.ts
    └── scripts/
        └── watch-prd.py
```

---

## 6. Self-Correction Triggers

| Error Pattern | Trigger | Recovery Action |
|---|---|---|
| `table "X" not found` | NotebookLM query for FMS schema | Update column name per SCHEMA_AUDIT.md |
| `column "Y" not found` | NotebookLM query for FMS schema | Update column name per TECHNICAL_SPEC.md |
| HTTP 500 from `/auth/session` | NotebookLM query for Cassandra server config | Check CASSANDRA_API_URL env var |
| TypeScript error on `avatar_url` | NotebookLM query for users table schema | Replace with `user_photo_url` |
| Missing `organisation_id` in query | NotebookLM query for membership docs | Add org predicate per AuthContext pattern |
| `cassandra_token` undefined | NotebookLM query for token storage docs | Check SecureStore key names |

---

## 7. Phase Order

```
Phase 1 (CRITICAL)        Phase 2 (CRITICAL)       Phase 3 (SERVER)
├─ Create rules/          ├─ Query NotebookLM        ├─ Create server/
│   mcp-memory.md         │   for 21 sources         │   package.json
├─ Create ACTIVE_PRD.md   ├─ Synthesize build log   ├─ Create src/routes/
├─ Create TECHNICAL_SPEC  └─ Write to NotebookLM   ├─ Create src/tests/
└─ Create TEST_RESULTS    (so LTM is seeded)       └─ Create watch-prd.py
.log
```

---

## 8. Verification Criteria

After implementation, running `claude` in a fresh session will:
1. **Auto-query** NotebookLM for Master Loop state before touching any code
2. **Refuse** to guess on schema errors — must query MCP first
3. **Auto-etch** build results to both file log AND NotebookLM on session close
4. **Have** a local server to run `curl http://localhost:3001/health` for QA
5. **Enforce** PRD-driven development — no module touched without reading ACTIVE_PRD.md first
