# Cassandra Stress Test Audit
> First-Principles Engineering Review
> Generated: 2026-05-30
> Auditor Mindset: "I have deployed this to production and it failed. Prove to me it won't fail again."

---

## How to Use This Document

Each section contains **Claims** (what the PRD/docs say), **Questions** (what a skeptical engineer asks), and **Code Evidence** (the actual source code). Every question demands a **1-point score**:
- **1 point** = Claim is fully proven with code attached
- **0.5 points** = Claim is partially true but has gaps
- **0 points** = Claim is false or unproven

**Target: 85%+ pass rate before production deploy.**

---

## Section 1: Architecture & First Principles

### Q1.1: Is the system actually modular, or is `cassandra/main.py` still the live entry point?

**Claim:** "All modular routers are properly mounted."

**Question:** Grepping the codebase for `include_router(chat_router)` or `include_router(features_router)` returns zero matches. The orchestrator router is exported from `cassandra/chat/__init__.py` but nowhere calls it. The ONLY live entry point is `cassandra/orchestrator/api_server.py` (FastAPI on port 8000). If `cassandra/main.py` is still in the repo and running in production, then the "modular architecture" is a fiction.

**Code Evidence:**
```bash
$ grep -r "include_router" /Users/lohitaksha/Lohit\ Mobile\ App/cassandra/
# ZERO RESULTS
```

**Actual Router Mounting (server/src/index.ts):**
```typescript
fastify.register(healthRoutes);
fastify.register(authRoutes);
fastify.register(ticketRoutes);
fastify.register(propertyRoutes);
fastify.register(cassandraRoutes);  // ← proxies to Python on :8000
fastify.register(contextPlugin);
```

**Gap:** The Fastify server does NOT mount `features_router` or `orchestrator_router` directly. It proxies everything to the Python FastAPI server. If the Python server dies, the entire Cassandra layer dies. There is no circuit breaker.

**Score: 0.5/1** — Partial. Routes are mounted at Fastify level but not modular within Python.

---

### Q1.2: Does the SQL Engine prompt tell the LLM to include or OMIT `organization_id`?

**Claim:** "The LLM must know tenant scope upfront."

**Question:** The post-mortem explicitly called this out as a CRITICAL miss. What does the SQL Engine tool description tell the LLM? Does it say "include org_id" or "org_id is automatically injected"?

**Code Evidence (cassandra/tools/sql_engine.py, line 52-57):**
```python
description = (
    "Execute a SQL query against the FMS database. "
    "org_id is automatically injected from context. "
    "Returns query results as JSON array. "
    "Only SELECT queries are supported in this tool."
)
```

**Gap:** The tool description tells the LLM that `org_id is automatically injected`. This means the LLM has NO INCENTIVE to include tenant scoping in its generated SQL. The SQL Guard BLOCKS queries without org_id, but the PRD says validation must happen BEFORE generation. The Guard is a safety net, not the primary enforcement.

**Score: 0/1** — FAIL. The LLM prompt still teaches the model to omit org_id.

---

### Q1.3: Is the SQL Guard injecting or BLOCKING?

**Claim:** "SQL Guard now BLOCKS queries without org_id instead of silently injecting."

**Question:** Show me the exact code path. When a query lacks org_id, does the Guard add it and proceed, or does it return an error?

**Code Evidence (cassandra/tools/sql_guard.py, line 166-177):**
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

**Verification:** The GuardResult has an `injected_org_id` field. Is it ever set to True?

```python
# Line 89: injected_org_id: bool = False
# Line 197: injected_org_id=org_check.injected
# OrgCheckResult.injected is ALWAYS False (line 285: return OrgCheckResult(has_org_id=False, injected=False))
```

**Score: 1/1** — PASS. The Guard BLOCKS. No silent injection.

---

## Section 2: Security & Tenant Isolation

### Q2.1: Does `/auth/session` return `allowed_property_ids` or `membership_id`?

**Claim:** "The backend hydrates user context with all required fields."

**Question:** The post-mortem found these fields do not exist anywhere. What does `/auth/session` actually return?

**Code Evidence (server/src/routes/auth.ts, line 79-83):**
```typescript
return {
  cassandra_token: `cassandra_mock_${Buffer.from(token).toString('base64').substring(0, 32)}`,
  expires_at: expiresAtSeconds,
  user_id: 'dev_user_id',
};
```

**Gap:** Returns ONLY `cassandra_token`, `expires_at`, `user_id`. No `allowed_property_ids`. No `membership_id`. No `role`. The mobile app cannot hydrate property-scoped context from this response.

**Score: 0/1** — FAIL. Three critical fields are missing.

---

### Q2.2: Does the E2E test for cross-tenant isolation actually pass?

**Claim:** "32/32 integration tests passing."

**Question:** The e2e-security tests use `supertest` hitting `http://localhost:3001`. The tests expect 403 for cross-tenant. But the cassandra plugin in Fastify is in DEV MODE — it bypasses JWT verification and injects `DEV_IDENTITY`. How can a cross-tenant test pass if the middleware bypasses the JWT entirely?

**Code Evidence (server/src/plugins/cassandra.ts, line 204-207):**
```typescript
if (config.devMode) {
  (request as any).state.identity = DEV_IDENTITY;
  return;
}
```

**Code Evidence (e2e-security.test.ts, line 58-73):**
```typescript
it('should return 403 when org_a user accesses org_b data', async () => {
  const res = await request(BASE_URL)
    .post('/cassandra/chat')
    .set('Authorization', `Bearer ${JWT_ORG_A}`)
    .send({ message: 'Show me all tickets', context: { org_id: 'org_b', user_id: 'user_a' } });
  expect(res.status).toBe(403);
});
```

**Gap:** If `NODE_ENV !== 'production'`, the test is testing against DEV_IDENTITY, not the actual JWT. The test only passes if `NODE_ENV=production` OR if the test runner sets it. But the integration tests run with `buildServer({ logger: false })` which does not override `NODE_ENV`. If `NODE_ENV` is unset or `development`, the middleware bypasses JWT and the cross-tenant test tests nothing.

**Score: 0/1** — FAIL. E2E security tests are testing mock identity, not real JWT validation.

---

### Q2.3: Is `property_memberships` in the SQL Guard whitelist a scope creep?

**Claim:** "SQL Guard whitelist is restricted to business data tables."

**Question:** The PRD Required Allowed Tables only lists: `tickets, work_orders, assets, properties, vendors, staff`. But the whitelist includes `organization_memberships`, `property_memberships`, `users`, etc. Was `property_memberships` added without checking product intent?

**Code Evidence (cassandra/tools/sql_guard.py, line 37-57):**
```python
ALLOWED_TABLES: set[str] = {
    "tickets", "ticket_comments", "properties", "organizations",
    "organization_memberships", "property_memberships", "users",
    "meeting_rooms", "meeting_room_bookings", "meeting_room_credits",
    "visitor_logs", "stock_items", "stock_movements",
    "sop_templates", "sop_checklist_items", "sop_completions",
    "electricity_readings", "diesel_readings", "ppm_schedules",
}
```

**Gap:** `organization_memberships` and `property_memberships` are metadata/join tables. If the product intent was "AI can only query business data," then exposing membership metadata is scope creep. A tenant could potentially enumerate other users in their org.

**Score: 0.5/1** — Partial. Pragmatic expansion but not aligned with original PRD table list.

---

## Section 3: Chain of Thought / Reasoning Streaming

### Q3.1: Does `run_stream()` actually stream in real-time, or does it batch?

**Claim:** "SSE streams the internal Chain of Thought in real time."

**Question:** `run_stream()` is a SYNCHRONOUS generator. FastAPI's `StreamingResponse` iterates over it with a `for chunk in stream_gen` loop. Between each yield, the entire agent logic (Intent → Context → Permission → Retrieval → Reasoning → Validation → Response) runs synchronously. There is no `await` inside the agent calls. Does this actually stream in real-time, or does it batch all reasoning and then flush?

**Code Evidence (api_server.py, _stream_chat_generator):**
```python
async def _stream_chat_generator(...):
    orchestrator = Orchestrator(config)
    stream_gen = orchestrator.run_stream(message, conversation_history)
    for chunk in stream_gen:
        yield _sse_format(chunk.event, chunk.data)
        await asyncio.sleep(0)
```

**Code Evidence (master_loop.py, run_stream — Intent Agent call):**
```python
intent_agent = agents["intent"]
intent_result = intent_agent.run(
    message=user_message,
    current_timestamp=current_timestamp,
)
```

**Gap:** The `IntentAgent.run()` is a synchronous method. If it takes 2 seconds (LLM API call), the stream yields NOTHING for 2 seconds, then yields the reasoning chunk. The user sees a 2-second pause, then a flood of events. This is "batch-then-flush" streaming, not true real-time streaming where each token from the LLM is forwarded.

**Score: 0.5/1** — Partial. Events are yielded between stages, but each stage blocks until the LLM returns.

---

### Q3.2: If the Validation Loop fails 3 times, does the user see the raw errors?

**Claim:** "Validation errors are fed back for self-correction, never shown to user."

**Question:** In `run_stream()`, when validation fails, it yields a `validation` event with `passed: False`. Does this leak internal validation errors to the UI?

**Code Evidence (master_loop.py, validation failure path):**
```python
yield StreamChunk(
    event="validation",
    data={
        "iteration": iteration,
        "message": f"Issue found — correcting…",
        "passed": False,
    }
)
```

The actual errors (`validation_result.errors`) are NOT yielded. They are only logged server-side.

**Score: 1/1** — PASS. Internal errors are not leaked to the client.

---

## Section 4: UI / UX — Collapsible Reasoning Bubble

### Q4.1: Does the ReasoningBubble actually collapse and expand?

**Claim:** "Collapsible bubble with timeline view."

**Question:** The component has an `expanded` state toggled by `TouchableOpacity`. But the `ScrollView` in `CassandraSessionModal` renders multiple messages. If the user has 20 messages and tries to expand a reasoning bubble from a message 10 turns ago, does React Native preserve the state correctly? Is `expanded` stored per-message or globally?

**Code Evidence (CassandraSessionModal.tsx, reasoning rendering):**
```tsx
{(isReasoningActive || reasoningSteps.length > 0) && (
  <View style={styles.bubbleRowLeft}>
    <ReasoningBubble
      steps={reasoningSteps}
      isActive={isReasoningActive}
    />
  </View>
)}
```

**Gap:** `reasoningSteps` and `isReasoningActive` are component-level state variables, NOT per-message state. Only the CURRENT turn's reasoning is shown. Historical messages do NOT have their reasoning bubbles attached. The `reasoningSteps` field on `ChatMessage` is populated but NEVER rendered when mapping `messageHistory`.

**Score: 0.5/1** — Partial. The bubble exists and works for the current turn, but historical reasoning is lost in the UI.

---

### Q4.2: Does the ReasoningBubble handle 50+ reasoning steps without layout overflow?

**Claim:** "Timeline with vertical dots and lines."

**Question:** The timeline uses a `minHeight: 16` line between dots. If there are 50 reasoning steps (e.g., complex multi-tool workflow), does the bubble expand beyond screen height? Is there a `maxHeight` or `ScrollView` inside the bubble?

**Code Evidence (ReasoningBubble.tsx, stepsContainer):**
```tsx
<View style={styles.stepsContainer}>
  {displaySteps.map((step, index) => (
    <View key={`${index}-${step}`} style={styles.stepRow}>
      ...
    </View>
  ))}
</View>
```

**Gap:** No `maxHeight`, no `ScrollView`, no virtualization. A complex workflow with many tool calls could render a bubble taller than the screen, pushing the actual answer off-screen.

**Score: 0.5/1** — Partial. Works for simple workflows, unbounded for complex ones.

---

## Section 5: Master Loop — The "20-Line" Claim

### Q5.1: Is the Master Loop actually 20 lines?

**Claim:** "20-line Master Loop (P→A→O→S cycle)."

**Question:** Count the lines in `run_stream()` from PERCEPTION to SYNTHESIS. It's approximately 170 lines of code. The PRD may refer to a CONCEPTUAL 20-line loop, but the implementation is a 650-line file with 9 stages, validation loops, and error handling. Where is the "20-line" loop?

**Code Evidence:**
```bash
$ wc -l cassandra/orchestrator/master_loop.py
823 lines
```

**Gap:** The actual implementation is ~800 lines. The "20-line" claim is either aspirational or refers to a pseudocode representation, not the production code. An engineer debugging a production issue must read 800 lines, not 20.

**Score: 0/1** — FAIL. The claim is misleading. The loop is 800+ lines.

---

### Q5.2: Can you trace a specific use case through the loop with exact stage transitions?

**Claim:** "7-Agent Flow: Intent → Context → Permission → Retrieval → Reasoning → Validation → Response."

**Question:** Walk me through: User says "Show me critical tickets at SS Plaza." What is the EXACT sequence of stages, tool calls, and validation iterations? Which agent resolves "SS Plaza" to a `property_id`?

**Code Evidence (master_loop.py, _resolve_property_id):**
```python
def _resolve_property_id(self, context, intent_result):
    entities = getattr(intent_result, "extracted_entities", {})
    if "property_id" in entities:
        return entities["property_id"]
    if len(context.allowed_property_ids) == 1:
        return context.allowed_property_ids[0]
    return None
```

**Gap:** If the user says "SS Plaza" but the Intent Agent does not extract `property_id` from the text (no NLP entity extraction is shown in `intent.py`), `_resolve_property_id` falls back to auto-select if there's only one property. If the user has MULTIPLE properties, `property_id` is `None`, and the Retrieval Agent queries without property scope. The system does NOT fuzzy-match "SS Plaza" to a property ID.

**Score: 0.5/1** — Partial. The flow exists but entity extraction is not implemented.

---

## Section 6: WebSockets & Persistence

### Q6.1: How many concurrent WebSocket audio sessions can the system handle?

**Claim:** "Support 100 concurrent users with 24h persistent sessions."

**Question:** The `AudioSessionManager` stores sessions in a Python dict (`self._sessions`). Each WebSocket handler runs in a single Python process (uvicorn with default settings = 1 worker). What happens at 101 connections? Is there any connection limit enforcement?

**Code Evidence (api_server.py, AudioSessionManager):**
```python
class AudioSessionManager:
    def __init__(self):
        self._sessions: dict[str, dict] = {}
        self._rate_limiter = self._init_rate_limiter()
```

**Gap:** No `max_sessions` limit. No eviction policy. No memory cap. At 101 connections, the dict grows unbounded. If sessions leak (client disconnects without `end_session`), they persist in memory forever.

**Score: 0/1** — FAIL. No session limit, no eviction, no memory management.

---

### Q6.2: Are WebSocket sessions actually persisted for 24 hours?

**Claim:** "24h persistent sessions."

**Question:** The `AudioSessionManager._sessions` dict is in-memory. If the Python process restarts, all sessions are lost. Where is the Redis/database backing? The session has `started_at` but no `expires_at` or TTL.

**Code Evidence (api_server.py, start_session):**
```python
self._sessions[session_id] = {
    "org_id": org_id,
    "property_id": property_id,
    "started_at": datetime.now(timezone.utc).isoformat(),
    "message_count": 0,
    "last_activity": datetime.now(timezone.utc).isoformat(),
}
```

**Gap:** No TTL. No Redis. No database. Sessions are pure in-memory and die with the process. The "24h persistent" claim is unimplemented.

**Score: 0/1** — FAIL. Sessions are ephemeral, not persistent.

---

## Section 7: Rate Limiting

### Q7.1: Is rate limiting actually enforced in the WebSocket audio path?

**Claim:** "Rate limit: tenant → 5400s, admin → unlimited."

**Question:** The `AudioSessionManager.start_session()` calls `self._rate_limiter.check()`. But the rate limiter is lazy-imported and can fail silently (`except Exception: return None`). If `_rate_limiter` is None, does the session bypass rate limiting entirely?

**Code Evidence (api_server.py, _init_rate_limiter):**
```python
def _init_rate_limiter(self):
    try:
        from cassandra.tools.rate_limiter import RateLimiter
        return RateLimiter()
    except Exception:
        return None
```

**Code Evidence (start_session, rate limit check):**
```python
if self._rate_limiter:
    limit_result = self._rate_limiter.check(user_id, org_id, role)
    if not limit_result.allowed:
        return False, f"RATE_LIMIT_EXHAUSTED..."
```

**Gap:** If `RateLimiter()` fails to import (missing dependency, broken file), `_rate_limiter` is `None`, and the `if self._rate_limiter:` block is skipped. Rate limiting is SILENTLY DISABLED.

**Score: 0.5/1** — Partial. Rate limiting exists but fails open (unsafe default).

---

### Q7.2: Does the SSE streaming endpoint have rate limiting?

**Claim:** "Rate limiting enforced across all endpoints."

**Question:** The `/chat/stream` endpoint in `api_server.py` does NOT call the rate limiter. It only checks `org_id`. A malicious client could open 1000 SSE connections and stream indefinitely.

**Code Evidence (api_server.py, /chat/stream handler):**
```python
async def chat_stream(request: StreamChatRequest):
    ...
    if not org_id:
        error_payload = _sse_format("error", {"code": "MISSING_ORG_ID", ...})
        return StreamingResponse(iter([error_payload]), media_type="text/event-stream")
    return StreamingResponse(_stream_chat_generator(...), ...)
```

**Gap:** No rate limiter import. No connection throttling. No max concurrent streams per user.

**Score: 0/1** — FAIL. SSE endpoint has zero rate limiting.

---

## Section 8: Error Handling & Resilience

### Q8.1: If the Python orchestrator crashes mid-stream, what does the mobile app see?

**Claim:** "Explicit error surfacing instead of silent failures."

**Question:** In `_stream_chat_generator()`, if `orchestrator.run_stream()` raises an exception (e.g., an agent crashes), the exception is NOT caught. It will bubble up and FastAPI will return a 500. But the client is reading a `text/event-stream` response. Will it receive a proper `event: error` or just a truncated stream?

**Code Evidence (api_server.py, _stream_chat_generator):**
```python
async def _stream_chat_generator(...):
    orchestrator = Orchestrator(config)
    stream_gen = orchestrator.run_stream(message, conversation_history)
    for chunk in stream_gen:
        yield _sse_format(chunk.event, chunk.data)
        await asyncio.sleep(0)
```

**Gap:** No `try/except` around the generator loop. If any agent raises, the SSE connection aborts mid-stream. The mobile app's `SSEParser` will hit `xhr.onerror` and show "Cannot reach Cassandra," which masks the actual error.

**Score: 0/1** — FAIL. Mid-stream crashes produce generic network errors, not structured error events.

---

### Q8.2: Does the Harness actually never break?

**Claim:** "Harness never raises — loop always continues."

**Question:** The `Harness.execute_tool()` has a `try/except` that catches exceptions and returns `ToolResult.error`. But what if `tool.execute()` hangs (e.g., database connection pool exhausted)? There is no timeout.

**Code Evidence (master_loop.py, Harness.execute_tool):**
```python
try:
    result = tool.execute(call.arguments, context)
    result.execution_ms = self._elapsed_ms(start)
    return result
except Exception as exc:
    return ToolResult(..., error=f"TOOL_RAISED: ...")
```

**Gap:** No timeout on `tool.execute()`. If `SQLEngineTool._execute_real()` deadlocks on the database, the entire Master Loop hangs forever (until `max_turns` is hit, but `turn_count` is never incremented in `run_stream()`).

**Score: 0.5/1** — Partial. Catches exceptions but not hangs/timeouts.

---

## Section 9: Data Architecture & Router Wiring

### Q9.1: Is `fastify.printRoutes()` actually called?

**Claim:** "Route dump on startup for audit."

**Question:** The code calls `fastify.printRoutes()` but does it actually print anything useful? And does anyone read it?

**Code Evidence (server/src/index.ts, line 85-92):**
```typescript
server.listen({ port: PORT, host: HOST }).then((address) => {
  console.log(`\n🚀 Autopilot Server running at ${address}`);
  ...
  const routes = server.printRoutes({ commonPrefix: false });
  console.log('📋 Registered routes:');
  console.log(routes);
});
```

**Score: 1/1** — PASS. It's there and it logs.

---

### Q9.2: Does the Fastify `/cassandra/chat/stream` proxy properly forward SSE?

**Claim:** "Fastify proxies SSE from Python to mobile."

**Question:** The proxy code uses `reply.raw.writeHead()` and `reply.raw.write()`. But Fastify has its own response lifecycle. If Fastify tries to set headers after `reply.raw.writeHead()`, it will throw. Also, the proxy does NOT propagate the client's `Authorization` header to the Python backend.

**Code Evidence (server/src/plugins/cassandra.ts, proxy):**
```typescript
const upstream = await fetch(
  `http://${config.host}:${config.port}/chat/stream`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(upstreamBody),
  }
);
```

**Gap:** The upstream `fetch()` does NOT include the original `Authorization` header. The Python `/chat/stream` endpoint expects a Bearer token (it checks `authorization` in `tool_execute`), but the Fastify proxy sends an UNAUTHENTICATED request to Python. The Python server will reject it with 401.

**Score: 0/1** — FAIL. Proxy strips auth headers. Python backend receives unauthenticated requests.

---

## Section 10: Testing & Verification Gaps

### Q10.1: How many tests verify the SSE event sequence?

**Claim:** "32/32 integration tests passing."

**Question:** Grepping the test files for `/chat/stream` or `SSE` or `event:` returns zero results. There are NO tests for the streaming endpoint.

**Code Evidence:**
```bash
$ grep -r "chat/stream" /Users/lohitaksha/Lohit\ Mobile\ App/server/src/tests/
# ZERO RESULTS
$ grep -r "SSE\|event:" /Users/lohitaksha/Lohit\ Mobile\ App/server/src/tests/
# ZERO RESULTS
```

**Gap:** The most critical new endpoint (`/chat/stream`) has ZERO test coverage. The 32 passing tests are for health, auth, and ticket endpoints — none test streaming.

**Score: 0/1** — FAIL. Zero tests for the primary deliverable of this PRD.

---

### Q10.2: Do the auth tests use real JWT verification?

**Claim:** "E2E security tests verify JWT validation."

**Question:** The tests create fake JWTs with `fake_signature`. The server decodes them without verification in dev mode. The tests pass because the server is in dev mode. In production, the server would need Supabase's public key to verify signatures. Is there a test that verifies signature rejection?

**Code Evidence (e2e-security.test.ts, JWT creation):**
```typescript
const signature = 'fake_signature';
return `${header}.${body}.${signature}`;
```

**Code Evidence (cassandra/middleware/identity.py, JWT decode):**
```python
def decode_jwt_payload(token: str) -> dict[str, Any] | None:
    # NOTE: In production, this should verify the signature
    # For development, we decode without verification.
```

**Gap:** No signature verification in tests. No test for expired JWTs. No test for revoked tokens. The auth layer is tested with fake credentials against a dev-mode bypass.

**Score: 0/1** — FAIL. Auth tests test the bypass, not the security.

---

## Section 11: Business / Product Gaps

### Q11.1: Can a tenant escalate a ticket to org_admin?

**Claim:** "Role-based tool access enforced."

**Question:** The `RoleGate` allows `escalate_ticket` for `Role.MST` (level 40). A `TENANT` (level 10) is DENIED. But in a real property management workflow, a TENANT should be able to escalate a critical issue. Is the RBAC too restrictive for business reality?

**Code Evidence (cassandra/harness/role_gate.py, line 63):**
```python
"escalate_ticket": Role.MST,  # Can escalate
```

**Gap:** No `escalate_ticket` permission for tenants. Product decision needed: should tenants be able to escalate? If yes, the RBAC table is wrong.

**Score: N/A** — Product decision required.

---

### Q11.2: What happens when the LLM generates SQL for a table that doesn't exist in FMS?

**Claim:** "SQL Guard whitelist prevents unauthorized table access."

**Question:** The `reasoning.py` agent generates SQL for `budgets` table:
```python
elif intent_type == "query_budget" or "budget" in message_lower:
    tool_calls.append({
        "name": "sql_engine",
        "arguments": {
            "query": f"SELECT * FROM budgets WHERE organization_id = '{org_id}' LIMIT 10",
        },
    })
```

But `budgets` is NOT in `ALLOWED_TABLES`. The Guard will BLOCK this query. Every budget query will fail. Was this intentional?

**Code Evidence (cassandra/agents/reasoning.py, line 180-188):**
```python
tool_calls.append({
    "name": "sql_engine",
    "arguments": {
        "query": f"SELECT * FROM budgets WHERE organization_id = '{org_id}' LIMIT 10",
    },
})
```

**Gap:** The Reasoning Agent generates queries for `budgets` but the SQL Guard whitelist does not include `budgets`. This is a guaranteed failure path for every budget query.

**Score: 0/1** — FAIL. Reasoning Agent and SQL Guard are in conflict.

---

## Section 12: Post-Mortem Pain Points (Extracted)

### PM-1: "I treated curl working as proof the browser could reach the backend"
**Status:** NOT FIXED. The mobile app still uses `XMLHttpRequest` (not fetch) with hardcoded `BASE_URL`. Network diagnostics are still server-side only.

### PM-2: "I didn't verify the dev server was running before telling you to reload"
**Status:** NOT FIXED. No health check in the mobile app verifies the dev server is alive before opening the chat modal.

### PM-3: "I assumed saas_mobile and apps/mobile were perfectly synchronized"
**Status:** NOT FIXED. The `saas_mobile_app/` directory IS the app, but there may be stale references to `apps/mobile` or `frontend/expo` in documentation.

### PM-4: "I brushed off the /chat 500 error too quickly"
**Status:** PARTIALLY FIXED. The `/chat/stream` endpoint now has better error formatting (`event: error`), but mid-stream 500s still produce generic client-side errors.

### PM-5: "I confused app-level gate removed with the app will work fine"
**Status:** ADDRESSED IN THIS PRD. State gates were added to `handleSend`.

### PM-6: "I didn't tell you that .env changes require a Metro restart"
**Status:** NOT DOCUMENTED. No README or AGENTS.md mentions this.

### PM-7: "The backend /chat endpoint doesn't accept allowed_property_ids or membership_id"
**Status:** NOT FIXED. Fastify proxy still doesn't forward these fields.

### PM-8: "No end-to-end test for the auth flow"
**Status:** NOT FIXED. Zero tests for `/chat/stream`.

---

## Scorecard

| Section | Question | Score | Critical? |
|---------|----------|-------|-----------|
| 1.1 | Modular router mounting | 0.5 | No |
| 1.2 | SQL prompt tells LLM to omit org_id | **0** | **YES** |
| 1.3 | SQL Guard blocks (no injection) | 1 | No |
| 2.1 | `/auth/session` missing fields | **0** | **YES** |
| 2.2 | E2E tests test mock identity | **0** | **YES** |
| 2.3 | property_memberships whitelist creep | 0.5 | No |
| 3.1 | Streaming is batch-then-flush | 0.5 | No |
| 3.2 | Validation errors not leaked | 1 | No |
| 4.1 | Historical reasoning not rendered | 0.5 | No |
| 4.2 | No maxHeight on bubble | 0.5 | No |
| 5.1 | "20-line loop" is 800 lines | **0** | No |
| 5.2 | Property name not fuzzy-matched | 0.5 | No |
| 6.1 | No session limit | **0** | **YES** |
| 6.2 | Sessions not persisted | **0** | **YES** |
| 7.1 | Rate limiter fails open | 0.5 | No |
| 7.2 | SSE has no rate limiting | **0** | **YES** |
| 8.1 | Mid-stream crashes = generic error | **0** | **YES** |
| 8.2 | No tool timeout | 0.5 | No |
| 9.1 | Route dump works | 1 | No |
| 9.2 | Proxy strips auth headers | **0** | **YES** |
| 10.1 | Zero tests for `/chat/stream` | **0** | **YES** |
| 10.2 | Auth tests test bypass | **0** | **YES** |
| 11.2 | budgets table not in whitelist | **0** | **YES** |

**Total: 8.5 / 23 = 37%**

---

## Critical Blockers (Must Fix Before Production)

1. **[1.2]** SQL Engine prompt tells LLM to OMIT org_id — violates PRD
2. **[2.1]** `/auth/session` missing `allowed_property_ids`, `membership_id`, `role`
3. **[2.2]** E2E security tests run against dev-mode bypass, not real JWT
4. **[6.1]** No WebSocket session limit — unbounded memory growth
5. **[6.2]** Sessions are ephemeral, not 24h persistent
6. **[7.2]** SSE endpoint has zero rate limiting
7. **[8.1]** Mid-stream crashes produce generic errors
8. **[9.2]** Fastify proxy strips auth headers from Python backend
9. **[10.1]** Zero test coverage for `/chat/stream`
10. **[11.2]** `budgets` table queries guaranteed to fail (not in whitelist)

---

## Recommendations

1. **Fix the LLM prompt** — Rewrite `SQLEngineTool.description` to say "You MUST include organization_id in every query."
2. **Add auth to proxy** — Forward `Authorization` header in Fastify's `/cassandra/chat/stream` proxy.
3. **Add session limits** — Cap `AudioSessionManager._sessions` at 100, add LRU eviction.
4. **Add Redis for sessions** — Replace in-memory dict with Redis TTL for true persistence.
5. **Add rate limiting to SSE** — Reuse `RateLimiter` in `/chat/stream` handler.
6. **Add exception handling** — Wrap `run_stream()` in `try/except` that yields `event: error`.
7. **Add tests** — Write FastAPI TestClient tests for `/chat/stream` event sequences.
8. **Fix budgets** — Either add `budgets` to `ALLOWED_TABLES` or remove budget queries from ReasoningAgent.
9. **Fix E2E tests** — Run with `NODE_ENV=production` or mock the middleware properly.
10. **Document .env reload** — Add to AGENTS.md: ".env changes require Metro restart."
