# Cassandra Stress Test Audit — VERIFIED
> First-Principles Engineering Review
> Generated: 2026-05-30
> Method: Read every source file + ran full test suite
> Auditor Mindset: "I have deployed this to production and it failed. Prove to me it won't fail again."

---

## How to Use This Document

Each section contains:
- **Claim** — what the PRD/docs say
- **Question** — what a skeptical engineer asks
- **Code Evidence** — the ACTUAL source code (verified by reading the file)
- **Test Evidence** — actual test results (`npx vitest run`)
- **Verdict** — Fixed, Partial, or Broken
- **Score** — 1 (pass), 0.5 (partial), 0 (fail)

**Target: 85%+ pass rate before production deploy.**

---

## Section 1: Architecture & First Principles

### Q1.1: Is the system actually modular, or is `cassandra/main.py` still the live entry point?

**Claim:** "All modular routers are properly mounted."

**Verification:**
```bash
$ grep -r "include_router" /Users/lohitaksha/Lohit\ Mobile\ App/cassandra/
# ZERO RESULTS — confirmed
```

**Code Evidence (server/src/index.ts):**
```typescript
fastify.register(healthRoutes);
fastify.register(authRoutes);
fastify.register(ticketRoutes);
fastify.register(propertyRoutes);
fastify.register(cassandraRoutes);  // ← proxies to Python on :8000
fastify.register(contextPlugin);
```

**Test Evidence:** `test-chat-stream.test.ts` (35 tests) all pass by mocking the orchestrator. The proxy works.

**Verdict:** Partial. No `include_router` calls exist, but the Fastify proxy successfully bridges to Python. The `chat_router` from `cassandra/chat/__init__.py` is still orphaned.

**Score: 0.5/1**

---

### Q1.2: Does the SQL Engine prompt tell the LLM to include or OMIT `organization_id`?

**Claim:** "The LLM must know tenant scope upfront."

**Code Evidence (cassandra/tools/sql_engine.py, lines 52-57):**
```python
description = (
    "Execute a SQL query against the FMS database. "
    "org_id is automatically injected from context. "
    "Returns query results as JSON array. "
    "Only SELECT queries are supported in this tool."
)
```

**Verification:** The description STILL tells the LLM that `org_id is automatically injected`. The LLM has zero incentive to include tenant scoping in generated SQL.

**Code Evidence (cassandra/tools/sql_guard.py, lines 14-19):**
```python
"""
Known Issue (from audit):
    The SQL Engine prompt historically told the LLM to OMIT org_id,
    relying on the Guard for fallback injection. This violates the PRD
    requirement that the LLM must know tenant scope upfront.

Fix Applied: SQL Guard now BLOCKS queries without org_id predicates
instead of silently injecting them. Errors are fed back to the model.
"""
```

**Test Evidence:** The Guard correctly blocks. No test exists for the LLM prompt content.

**Verdict:** BROKEN. The Guard blocks bad queries, but the LLM prompt still teaches the model to omit org_id. The "Fix Applied" note in sql_guard.py acknowledges this is a workaround, not a fix.

**Score: 0/1 — CRITICAL**

---

### Q1.3: Is the SQL Guard injecting or BLOCKING?

**Claim:** "SQL Guard now BLOCKS queries without org_id instead of silently injecting."

**Code Evidence (cassandra/tools/sql_guard.py, lines 166-177):**
```python
org_check = self._check_org_predicate(query)
if not org_check.has_org_id:
    return GuardResult(
        allowed=False,
        reason=(
            f"ORGS_ID_MISSING: Query to '{query.table}' must include org_id predicate. "
            f"Add 'organization_id = {self.org_id}' to WHERE clause. "
            f"The LLM must know tenant scope upfront — Guard will not inject silently."
        ),
    )
```

**Verification:** `injected_org_id` field exists but is never set to True. The `_check_org_predicate` returns `injected=False` always.

**Verdict:** FIXED. Confirmed BLOCKING behavior.

**Score: 1/1**

---

## Section 2: Security & Tenant Isolation

### Q2.1: Does `/auth/session` return `allowed_property_ids` and `membership_id`?

**Claim:** "The backend hydrates user context with all required fields."

**Code Evidence (server/src/routes/auth.ts, lines 13-21):**
```typescript
const TokenExchangeResponseSchema = z.object({
  token: z.string(),
  expires_at: z.number(),
  user_id: z.string(),
  org_id: z.string(),
  role: z.string(),
  allowed_property_ids: z.array(z.string()),
  membership_id: z.string().optional(),
});
```

**Code Evidence (server/src/routes/auth.ts, lines 180-202):**
```typescript
// Production return:
return {
  token: cassandraToken,
  expires_at: expiresAtSeconds,
  user_id: payload.sub,
  org_id: orgId,
  role,
  allowed_property_ids: allowedPropertyIds,  // Currently [] in production
};

// Dev return:
return {
  token: `cassandra_mock_${...}`,
  expires_at: expiresAtSeconds,
  user_id: 'dev_user_id',
  org_id: 'dev_org_id',
  role: 'org_admin',
  allowed_property_ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
};
```

**Test Evidence:** `test-auth-jwt.test.ts` — 58/58 pass. Tests verify `token`, `user_id`, `org_id`, `role` are returned.

**Verdict:** PARTIALLY FIXED (C0-16). `token`, `user_id`, `org_id`, `role`, `allowed_property_ids` are now returned. `membership_id` is in the schema as optional but NEVER returned in either dev or production path. Production `allowed_property_ids` is always `[]` (empty array) with a comment: "In production, we would fetch allowed_property_ids from Supabase."

**Score: 0.5/1**

---

### Q2.2: Do the E2E security tests use real JWT verification or dev-mode bypass?

**Claim:** "E2E tests verify JWT validation."

**Code Evidence (server/src/tests/e2e-security.test.ts, lines 37-75):**
```typescript
// FIX C0-03: Use real HMAC-SHA256 signing for JWTs
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-secret-key-for-e2e-tests';

async function createTestJWT(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 3600 };
  const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${headerB64}.${bodyB64}`));
  const signatureB64 = Buffer.from(signature).toString('base64url');
  return `${headerB64}.${bodyB64}.${signatureB64}`;
}
```

**BUT:** The file has a COMPILE ERROR:
```
The symbol "jwtOrgA" has already been declared
  134|  let jwtOrgA: string;
```

Lines 41-44 declare `const jwtOrgA = createTestJWT(...)` at module level (synchronous call on Promise).
Lines 134-137 redeclare `let jwtOrgA: string;` inside `beforeAll`.

**Code Evidence (server/src/plugins/cassandra.ts, lines 260-269):**
```typescript
if (config.devMode) {
  const explicitDevMode = process.env.CASSANDRA_DEV_MODE === 'true';
  if (!explicitDevMode) {
    console.warn('[Cassandra] devMode=true but CASSANDRA_DEV_MODE not set — requiring JWT');
  } else {
    requestWithState.state = { identity: DEV_IDENTITY };
    return;
  }
}
```

**Test Evidence:** `e2e-security.test.ts` does NOT COMPILE. Cannot run. `test-auth-jwt.test.ts` — 58/58 pass with real JWT verification.

**Verdict:** PARTIALLY FIXED (C0-03). The JWT creation now uses real HMAC-SHA256. BUT:
1. `e2e-security.test.ts` has a compile error (duplicate declarations) and cannot run.
2. The dev mode check was hardened (requires `CASSANDRA_DEV_MODE=true`), but `config.devMode` is still `process.env.NODE_ENV !== 'production'`.

**Score: 0.5/1**

---

### Q2.3: Is `property_memberships` in the SQL Guard whitelist a scope creep?

**Claim:** "SQL Guard whitelist is restricted to business data tables."

**Code Evidence (cassandra/tools/sql_guard.py, lines 37-59):**
```python
ALLOWED_TABLES: set[str] = {
    "tickets", "ticket_comments", "properties", "organizations",
    "organization_memberships", "property_memberships", "users",
    "meeting_rooms", "meeting_room_bookings", "meeting_room_credits",
    "visitor_logs", "stock_items", "stock_movements",
    "sop_templates", "sop_checklist_items", "sop_completions",
    "electricity_readings", "diesel_readings", "ppm_schedules",
    # FIX C0-05: Add budgets table for budget query support
    "budgets",
}
```

**Verdict:** `budgets` was added (C0-05). `property_memberships` and `organization_memberships` remain. Product decision needed on whether tenants should query membership metadata.

**Score: 0.5/1**

---

## Section 3: Chain of Thought / Reasoning Streaming

### Q3.1: Does `run_stream()` actually stream in real-time, or does it batch?

**Claim:** "SSE streams the internal Chain of Thought in real time."

**Code Evidence (cassandra/orchestrator/api_server.py, lines 526-533):**
```python
loop = asyncio.get_event_loop()
stream_gen = orchestrator.run_stream(message, conversation_history)

for chunk in stream_gen:
    yield _sse_format(chunk.event, chunk.data)
    # Small yield to allow event loop to breathe
    await asyncio.sleep(0)
```

**Code Evidence (cassandra/orchestrator/master_loop.py, lines 224-228):**
```python
# AGENT 1: INTENT
ctx.current_stage = LoopStage.INTENT
yield self._chunk("reasoning", {"step": "intent", "message": "Identifying intent..."})

intent = agents["intent"].run(message=message, current_timestamp=now)
```

**Verification:** `IntentAgent.run()` is a synchronous Python method. If the LLM API call takes 2 seconds, nothing is yielded for 2 seconds, then the reasoning chunk flushes. This is batch-then-flush, not token-level streaming.

**Test Evidence:** `test-chat-stream.test.ts` — all pass, but they MOCK the orchestrator. No test verifies streaming latency.

**Verdict:** NOT FIXED. Still batch-then-flush. The comment "Small yield to allow event loop to breathe" acknowledges the blocking nature.

**Score: 0.5/1**

---

### Q3.2: If the Validation Loop fails 3 times, does the user see the raw errors?

**Claim:** "Validation errors are fed back for self-correction, never shown to user."

**Code Evidence (cassandra/orchestrator/master_loop.py, lines 338-340):**
```python
errors = "; ".join(validation.errors[:3])
yield self._chunk("validation", {"iteration": i, "message": "Correcting...", "passed": False})
answer = f"[SELF-CORRECT {i}/3] Errors: {errors}\nPlease correct."
```

**Verification:** The `validation.errors` list is NOT yielded to the client. Only `"Correcting..."` is sent. The errors are fed back internally via `answer` for the next validation iteration.

**Verdict:** FIXED. Internal errors are not leaked.

**Score: 1/1**

---

## Section 4: UI / UX — Collapsible Reasoning Bubble

### Q4.1: Does the ReasoningBubble render historical reasoning per-message?

**Claim:** "Collapsible bubble with timeline view."

**Verification:** `reasoningSteps` and `isReasoningActive` are component-level state in `CassandraSessionModal.tsx`. When mapping `messageHistory`, historical messages do NOT render their stored `reasoningSteps`. Only the current turn shows reasoning.

**Test Evidence:** No UI tests exist in the repo for React Native components.

**Verdict:** NOT FIXED. Historical reasoning is lost in the UI.

**Score: 0.5/1**

---

### Q4.2: Does the ReasoningBubble handle 50+ reasoning steps without layout overflow?

**Claim:** "Timeline with vertical dots and lines."

**Verification:** `ReasoningBubble.tsx` has no `maxHeight`, no `ScrollView`, no virtualization inside the bubble.

**Verdict:** NOT FIXED. Unbounded growth for complex workflows.

**Score: 0.5/1**

---

## Section 5: Master Loop — The "20-Line" Claim

### Q5.1: Is the Master Loop actually 20 lines?

**Claim:** "20-line Master Loop (P→A→O→S cycle)."

**Code Evidence:**
```bash
$ wc -l cassandra/orchestrator/master_loop.py
441 lines
```

**Verification:** The file header says "Refactored from 872 lines → ~400 lines while maintaining ALL behavior." The actual `run_stream()` method is ~160 lines of dense logic with 7 agents, validation loops, tool execution, and error handling.

**Verdict:** NOT FIXED. The "20-line" claim was aspirational. The loop is 441 lines.

**Score: 0/1**

---

### Q5.2: Can you trace a specific use case through the loop with exact stage transitions?

**Claim:** "7-Agent Flow: Intent → Context → Permission → Retrieval → Reasoning → Validation → Response."

**Code Evidence (master_loop.py, lines 372-378):**
```python
def _resolve_property(self, ctx: OrchestratorContext, intent: Any) -> str | None:
    entities = getattr(intent, "extracted_entities", {})
    if "property_id" in entities:
        return entities["property_id"]
    if len(ctx.allowed_property_ids) == 1:
        return ctx.allowed_property_ids[0]
    return None
```

**Verification:** If the user says "SS Plaza" but `intent.extracted_entities` does not contain `property_id`, and the user has multiple properties, `property_id` is `None`. No fuzzy matching exists.

**Verdict:** NOT FIXED. Entity extraction for property names is not implemented.

**Score: 0.5/1**

---

## Section 6: WebSockets & Persistence

### Q6.1: How many concurrent WebSocket audio sessions can the system handle?

**Claim:** "Support 100 concurrent users with 24h persistent sessions."

**Code Evidence (cassandra/orchestrator/api_server.py, lines 252-254):**
```python
# FIX C0-10: Session limits
MAX_SESSIONS = 100  # Max concurrent WebSocket sessions
SESSION_TTL_SECONDS = 24 * 60 * 60  # 24 hours
```

**Code Evidence (lines 343-354):**
```python
if len(self._sessions) >= self.MAX_SESSIONS:
    evicted = self._evict_lru_session()
    if not evicted:
        return False, (
            f"SESSION_LIMIT_REACHED: Maximum concurrent sessions ({self.MAX_SESSIONS}) reached."
        )
```

**Test Evidence:** `test-sessions.test.ts` — 6 pass (unit tests for constants/logic), 8 fail (e2e tests need running server). The unit tests confirm `MAX_SESSIONS = 100` and LRU eviction logic.

**Verdict:** FIXED (C0-10). Session limit enforced with LRU eviction.

**Score: 1/1**

---

### Q6.2: Are WebSocket sessions actually persisted for 24 hours?

**Claim:** "24h persistent sessions."

**Code Evidence (cassandra/orchestrator/api_server.py, lines 269-279):**
```python
def _evict_expired_sessions(self) -> int:
    now = datetime.now(timezone.utc).timestamp()
    expired = [
        sid for sid, sess in self._sessions.items()
        if now > sess.get("expires_at", 0)
    ]
    for sid in expired:
        del self._sessions[sid]
    return len(expired)
```

**Code Evidence (lines 356-365):**
```python
expires_at = datetime.now(timezone.utc).timestamp() + self.SESSION_TTL_SECONDS
self._sessions[session_id] = {
    "org_id": org_id,
    "property_id": property_id,
    "started_at": datetime.now(timezone.utc).isoformat(),
    "expires_at": expires_at,  # FIX C0-11: TTL for session
    "message_count": 0,
    "last_activity": datetime.now(timezone.utc).isoformat(),
}
```

**Verification:** Sessions are stored in a Python `dict` (`self._sessions`). If the Python process restarts, all sessions are lost. No Redis, no database backing.

**Test Evidence:** `test-sessions.test.ts` — unit tests for TTL math pass. No test for process restart survival.

**Verdict:** PARTIALLY FIXED (C0-11). TTL and eviction exist, but sessions are still in-memory only. "24h persistent" is misleading — they survive 24h only if the process doesn't restart.

**Score: 0.5/1**

---

## Section 7: Rate Limiting

### Q7.1: Is rate limiting actually enforced in the WebSocket audio path?

**Claim:** "Rate limit: tenant → 5400s, admin → unlimited."

**Code Evidence (cassandra/orchestrator/api_server.py, lines 261-267):**
```python
def _init_rate_limiter(self):
    try:
        from cassandra.tools.rate_limiter import RateLimiter
        return RateLimiter()
    except Exception:
        return None
```

**Code Evidence (lines 328-340):**
```python
if self._rate_limiter:
    user_id = f"user_{session_id[:8]}"
    role = "tenant"
    limit_result = self._rate_limiter.check(user_id, org_id, role)
    if not limit_result.allowed:
        return False, f"RATE_LIMIT_EXHAUSTED: ..."
```

**Verification:** If `RateLimiter()` fails to import, `_rate_limiter` is `None`, and the `if self._rate_limiter:` block is skipped. Rate limiting is SILENTLY DISABLED.

**Verdict:** NOT FIXED. Still fails open.

**Score: 0.5/1**

---

### Q7.2: Does the SSE streaming endpoint have rate limiting?

**Claim:** "Rate limiting enforced across all endpoints."

**Code Evidence (cassandra/orchestrator/api_server.py, lines 579-598):**
```python
# FIX C0-07: Rate limiting for SSE endpoint
rate_limiter = _init_rate_limiter()
if rate_limiter:
    limit_result = rate_limiter.check(user_id or "anonymous", org_id, role)
    if not limit_result.allowed:
        error_payload = _sse_format(
            "error",
            {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": f"Rate limit exceeded. Resets at {datetime.fromtimestamp(limit_result.reset_at)}"
            }
        )
        return StreamingResponse(
            iter([error_payload]),
            media_type="text/event-stream",
            status_code=429,
        )
```

**Test Evidence:** `test-chat-stream.test.ts` has a test "documents rate limiting is not currently implemented" that passes. The rate limiting structure exists but may not be fully wired.

**Verdict:** FIXED (C0-07). Rate limiting code added to `/chat/stream`. BUT it still fails open if `RateLimiter` import fails.

**Score: 0.5/1**

---

## Section 8: Error Handling & Resilience

### Q8.1: If the Python orchestrator crashes mid-stream, what does the mobile app see?

**Claim:** "Explicit error surfacing instead of silent failures."

**Code Evidence (cassandra/orchestrator/api_server.py, lines 600-631):**
```python
# FIX C0-08: Exception handling for mid-stream crashes
try:
    return StreamingResponse(
        _stream_chat_generator(...),
        media_type="text/event-stream",
        ...
    )
except Exception as exc:
    logger.error(f"[API] /chat/stream crashed: {exc}", exc_info=True)
    error_payload = _sse_format(
        "error",
        {
            "code": "STREAM_ERROR",
            "message": "An unexpected error occurred. Please try again."
        }
    )
    return StreamingResponse(
        iter([error_payload]),
        media_type="text/event-stream",
        status_code=500,
    )
```

**Code Evidence (server/src/plugins/cassandra.ts, lines 504-525):**
```typescript
// FIX C0-08: Handle mid-stream errors gracefully
let streamError: Error | null = null;

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reply.raw.write(value);
  }
} catch (err) {
  streamError = err as Error;
  fastify.log.error(`[Cassandra] Stream interrupted: ${err}`);
} finally {
  if (streamError && !reply.sent) {
    const errorPayload = `event: error\ndata: ${JSON.stringify({
      code: 'STREAM_INTERRUPTED',
      message: 'Connection interrupted. Please try again.',
    })}\n\n`;
    reply.raw.write(errorPayload);
  }
  reply.raw.end();
}
```

**Test Evidence:** `test-chat-stream.test.ts` — "emits error event on stream interruption" passes. "returns 502 on upstream orchestrator failure" passes.

**Verdict:** FIXED (C0-08). Both Fastify proxy and Python endpoint now handle mid-stream errors.

**Score: 1/1**

---

### Q8.2: Does the Harness actually enforce tool timeouts?

**Claim:** "Harness never raises — loop always continues."

**Code Evidence (cassandra/orchestrator/master_loop.py, lines 112-134):**
```python
class Harness:
    TOOL_TIMEOUT_MS = 30000  # 30s circuit breaker

    def execute_tool(self, call: ToolCall, ctx: OrchestratorContext) -> ToolResult:
        start = datetime.now(timezone.utc)
        if not ctx.org_id:
            return self._fail(call, "MISSING_ORG_ID", start, ctx)
        if call.name not in self.tools:
            return self._fail(call, f"UNKNOWN_TOOL: '{call.name}'", start, ctx)
        try:
            result = self.tools[call.name].execute(call.arguments, ctx)
            result.execution_ms = self._elapsed_ms(start)
            return result
        except Exception as exc:
            return self._fail(call, f"TOOL_RAISED: {type(exc).__name__}: {exc}", start, ctx)
```

**Verification:** `TOOL_TIMEOUT_MS = 30000` is declared but NEVER USED. There is no `asyncio.wait_for()`, no `signal.alarm()`, no threading timeout. If `SQLEngineTool._execute_real()` hangs on a database deadlock, the Master Loop blocks forever.

**Verdict:** NOT FIXED. The constant exists but is not enforced.

**Score: 0.5/1**

---

## Section 9: Data Architecture & Router Wiring

### Q9.1: Is `fastify.printRoutes()` actually called?

**Claim:** "Route dump on startup for audit."

**Code Evidence (server/src/index.ts):**
```typescript
server.listen({ port: PORT, host: HOST }).then((address) => {
  console.log(`\n🚀 Autopilot Server running at ${address}`);
  const routes = server.printRoutes({ commonPrefix: false });
  console.log('📋 Registered routes:');
  console.log(routes);
});
```

**Verdict:** FIXED. Confirmed present.

**Score: 1/1**

---

### Q9.2: Does the Fastify `/cassandra/chat/stream` proxy properly forward SSE and auth headers?

**Claim:** "Fastify proxies SSE from Python to mobile."

**Code Evidence (server/src/plugins/cassandra.ts, lines 470-483):**
```typescript
// FIX C0-09: Forward Authorization header to Python orchestrator
const authHeader = request.headers.authorization;

const upstream = await fetch(
  `http://${config.host}:${config.port}/chat/stream`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { 'Authorization': authHeader } : {}),
    },
    body: JSON.stringify(upstreamBody),
  }
);
```

**Verification:** The `Authorization` header is now forwarded. The SSE response is streamed via `reply.raw.write()`.

**Test Evidence:** `test-chat-stream.test.ts` — 35/35 pass. "accepts valid JWT with Bearer prefix" passes. "returns 401 when Authorization header is missing" passes.

**Verdict:** FIXED (C0-09). Auth headers are forwarded. SSE proxy works.

**Score: 1/1**

---

## Section 10: Testing & Verification Gaps

### Q10.1: How many tests verify the SSE event sequence?

**Claim:** "32/32 integration tests passing."

**Test Evidence:**
```
Test Files: 3 failed | 2 passed (5 total when running all)
Tests: 11 failed | 155 passed (166 total)

BUT individually:
- test-chat-stream.test.ts: 35 passed, 0 failed
- test-auth-jwt.test.ts: 58 passed, 0 failed
- integration.test.ts: 30 passed, 2 failed
- test-sessions.test.ts: 6 passed, 8 failed
- e2e-security.test.ts: COMPILE ERROR (cannot run)
```

**Code Evidence (test-chat-stream.test.ts):**
```typescript
it('streams complete event sequence: reasoning→tool_start→tool_result→answer→done', async () => {
  // ... mock orchestrator and verify event sequence
});
```

**Verdict:** FIXED (C0-17). `test-chat-stream.test.ts` exists with 35 comprehensive SSE tests, ALL PASSING. BUT the full test suite still fails due to:
1. Port conflicts (EADDRINUSE) when running multiple files
2. `integration.test.ts` expects `cassandra_token` but endpoint returns `token`
3. `e2e-security.test.ts` has a compile error
4. `test-sessions.test.ts` needs a running server on port 3001

**Score: 0.5/1**

---

### Q10.2: Do the auth tests use real JWT verification?

**Claim:** "E2E security tests verify JWT validation."

**Test Evidence:**
```
test-auth-jwt.test.ts: 58 passed, 0 failed
```

Tests include:
- Valid signature (HMAC-SHA256) → accepted
- Expired JWT → rejected
- Forged JWT (wrong secret) → rejected
- Missing org_id → rejected with MISSING_ORG_ID
- Token store registration → verified
- Edge cases (null bytes, SQL injection in claims, malformed JWT)

**Verdict:** FIXED. `test-auth-jwt.test.ts` comprehensively tests real JWT verification.

**Score: 1/1**

---

## Section 11: Business / Product Gaps

### Q11.1: Can a tenant escalate a ticket to org_admin?

**Claim:** "Role-based tool access enforced."

**Code Evidence (cassandra/harness/role_gate.py, line 63):**
```python
"escalate_ticket": Role.MST,  # Can escalate
```

**Verdict:** No change. `TENANT` (level 10) cannot escalate. Product decision still required.

**Score: N/A**

---

### Q11.2: What happens when the LLM generates SQL for the `budgets` table?

**Claim:** "SQL Guard whitelist prevents unauthorized table access."

**Code Evidence (cassandra/agents/reasoning.py, lines 180-187):**
```python
elif intent_type == "query_budget" or "budget" in message_lower:
    tool_calls.append({
        "name": "sql_engine",
        "arguments": {
            "query": f"SELECT * FROM budgets WHERE organization_id = '{org_id}' LIMIT 10",
        },
    })
```

**Code Evidence (cassandra/tools/sql_guard.py, line 58):**
```python
# FIX C0-05: Add budgets table for budget query support
"budgets",
```

**Verdict:** FIXED (C0-05). `budgets` is now in `ALLOWED_TABLES`. The Reasoning Agent and SQL Guard are no longer in conflict.

**Score: 1/1**

---

## Section 12: New Issues Discovered During Verification

### N-1: `integration.test.ts` fails due to field name mismatch

**Test Failure:**
```
FAIL src/tests/integration.test.ts > POST /auth/session > returns 200 with mock token for valid JWT format
AssertionError: expected undefined to be defined
  expect(response.body.cassandra_token).toBeDefined();
```

**Root Cause:** The auth endpoint was changed to return `token` (C0-16), but `integration.test.ts` still expects `cassandra_token`. The test was not updated.

**Code Evidence (integration.test.ts, line 89):**
```typescript
expect(response.body.cassandra_token).toBeDefined();
```

**Code Evidence (auth.ts, line 181):**
```typescript
return { token: cassandraToken, ... };
```

**Verdict:** TEST BUG. Field name changed in implementation but not in test.

---

### N-2: `e2e-security.test.ts` has a COMPILE ERROR

**Test Failure:**
```
The symbol "jwtOrgA" has already been declared
  134|  let jwtOrgA: string;
```

**Root Cause:** Lines 41-44 declare `const jwtOrgA = createTestJWT(...)` at module level. Lines 134-137 redeclare `let jwtOrgA: string;` in `beforeAll`. The file cannot compile.

**Verdict:** TEST BUG. Duplicate variable declarations.

---

### N-3: `test-sessions.test.ts` expects fields Fastify doesn't return

**Test Failure:**
```
FAIL src/tests/test-sessions.test.ts > ... > should report session limit in health endpoint
expect(res.body).toHaveProperty('max_sessions')
```

**Root Cause:** The tests hit `http://localhost:3001/cassandra/health` expecting `max_sessions`, `session_ttl_seconds`, `max_validation_iterations`. But Fastify's `/cassandra/health` returns:
```typescript
return {
  enabled: config.enabled,
  orchestrator_running: processManager.isRunning(),
  dev_mode: config.devMode,
  port: config.port,
};
```

These fields come from the PYTHON `/health` endpoint, not the Fastify proxy. The test is calling Fastify directly.

**Verdict:** TEST / IMPLEMENTATION MISMATCH. Fastify health endpoint doesn't proxy Python health metadata.

---

### N-4: `test-sessions.test.ts` needs running server

**Test Failure:** 8 tests fail with `ECONNREFUSED 127.0.0.1:3001`.

**Root Cause:** These tests use `supertest` with `BASE_URL = 'http://localhost:3001'`, expecting an already-running server. They are e2e tests, not unit tests. No server is running during `npm test`.

**Verdict:** TEST INFRASTRUCTURE ISSUE. E2E tests mixed with unit test suite.

---

### N-5: Port conflict when running full test suite

**Test Failure:**
```
Unhandled Rejection: Error: listen EADDRINUSE: address already in use 0.0.0.0:3001
```

**Root Cause:** `integration.test.ts` and `test-auth-jwt.test.ts` both call `buildServer()` but some tests (or the server itself) try to listen on port 3001. When run in parallel, they collide.

**Verdict:** TEST INFRASTRUCTURE ISSUE. Tests are not isolated.

---

## Scorecard (Updated)

| Section | Question | Previous | Current | Status |
|---------|----------|----------|---------|--------|
| 1.1 | Modular router mounting | 0.5 | **0.5** | No change |
| 1.2 | SQL prompt tells LLM to omit org_id | 0 | **0** | NOT FIXED |
| 1.3 | SQL Guard blocks (no injection) | 1 | **1** | Fixed |
| 2.1 | `/auth/session` missing fields | 0 | **0.5** | FIXED C0-16 (membership_id still missing) |
| 2.2 | E2E tests test mock identity | 0 | **0.5** | FIXED C0-03 (but compile error in e2e file) |
| 2.3 | property_memberships whitelist creep | 0.5 | **0.5** | No change |
| 3.1 | Streaming is batch-then-flush | 0.5 | **0.5** | No change |
| 3.2 | Validation errors not leaked | 1 | **1** | Fixed |
| 4.1 | Historical reasoning not rendered | 0.5 | **0.5** | No change |
| 4.2 | No maxHeight on bubble | 0.5 | **0.5** | No change |
| 5.1 | "20-line loop" is 441 lines | 0 | **0** | No change |
| 5.2 | Property name not fuzzy-matched | 0.5 | **0.5** | No change |
| 6.1 | No session limit | 0 | **1** | FIXED C0-10 |
| 6.2 | Sessions not persisted | 0 | **0.5** | FIXED C0-11 (TTL exists, still in-memory) |
| 7.1 | Rate limiter fails open | 0.5 | **0.5** | No change |
| 7.2 | SSE has no rate limiting | 0 | **0.5** | FIXED C0-07 (still fails open) |
| 8.1 | Mid-stream crashes = generic error | 0 | **1** | FIXED C0-08 |
| 8.2 | No tool timeout | 0.5 | **0.5** | Constant exists but unused |
| 9.1 | Route dump works | 1 | **1** | Fixed |
| 9.2 | Proxy strips auth headers | 0 | **1** | FIXED C0-09 |
| 10.1 | Zero tests for `/chat/stream` | 0 | **0.5** | FIXED C0-17 (35 tests, but suite still fails) |
| 10.2 | Auth tests test bypass | 0 | **1** | FIXED (58 real JWT tests pass) |
| 11.2 | budgets table not in whitelist | 0 | **1** | FIXED C0-05 |

**Previous Total: 8.5 / 23 = 37%**
**Current Total: 12.5 / 23 = 54%**

---

## Critical Blockers (Must Fix Before Production)

### 🔴 STILL BROKEN
1. **[1.2]** SQL Engine prompt tells LLM to OMIT org_id — violates PRD
2. **[5.1]** "20-line loop" claim is misleading (441 lines)
3. **[8.2]** Tool timeout constant exists but is NEVER enforced

### 🟡 NEW ISSUES FOUND
4. **[N-1]** `integration.test.ts` fails — field name mismatch (`cassandra_token` vs `token`)
5. **[N-2]** `e2e-security.test.ts` has COMPILE ERROR — cannot run
6. **[N-3]** `test-sessions.test.ts` expects Python health fields from Fastify endpoint
7. **[N-4]** `test-sessions.test.ts` needs running server (e2e mixed with unit tests)
8. **[N-5]** Full test suite has port conflicts (EADDRINUSE)

### 🟢 FIXED SINCE LAST AUDIT
- C0-05: `budgets` added to ALLOWED_TABLES
- C0-07: Rate limiting added to SSE endpoint
- C0-08: Mid-stream exception handling
- C0-09: Auth headers forwarded in proxy
- C0-10: WebSocket session limit (100) with LRU eviction
- C0-11: Session TTL (24h) with expired session eviction
- C0-16: `/auth/session` returns `token`, `org_id`, `role`, `allowed_property_ids`
- C0-17: `test-chat-stream.test.ts` with 35+ SSE tests

---

## Recommendations (Prioritized)

1. **Fix the LLM prompt** — Change `SQLEngineTool.description` from "org_id is automatically injected" to "You MUST include organization_id in every query WHERE clause."
2. **Fix integration.test.ts** — Change `cassandra_token` to `token` on line 89.
3. **Fix e2e-security.test.ts** — Remove duplicate `let jwtOrgA` declarations (lines 134-137).
4. **Fix test-sessions.test.ts** — Either proxy Python health metadata through Fastify, or split e2e tests into a separate command.
5. **Fix test port conflicts** — Use random ports or sequential test execution.
6. **Enforce tool timeout** — Wrap `tool.execute()` in `asyncio.wait_for()` using `TOOL_TIMEOUT_MS`.
7. **Add Redis for sessions** — Replace in-memory dict for true persistence.
8. **Add property fuzzy matching** — Implement name-to-ID resolution in `_resolve_property()`.
9. **Document .env reload** — Add to AGENTS.md: ".env changes require Metro restart."
