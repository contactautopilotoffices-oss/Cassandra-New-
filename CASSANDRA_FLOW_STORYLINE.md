# Cassandra: The Complete Flow — A Minute-by-Minute Storyline
> From the moment you tap the Expo app icon to the moment Cassandra speaks back.
> Every function call. Every port. Every millisecond.

---

## The Banana Analogy

Before we begin, recall the banana:

1. **You see the banana** (perception — 0ms)
2. **You pick up the banana** (intent classification — 200ms)
3. **You peel the banana** (context loading + permission check — 400ms)
4. **You look at it** (retrieval: is this banana ripe? — 600ms)
5. **You decide to eat it** (reasoning: plan the bite — 800ms)
6. **You chew and verify it's good** (validation: taste check — 1,000ms)
7. **You swallow** (response: deliver the experience — 1,200ms)

Cassandra does the same thing. Every single message.

---

## Phase 0: App Launch (0ms — 2,000ms)

### [0ms] You tap the Cassandra app icon on your iPhone

**What happens:**
- Expo Go / React Native runtime boots.
- `saas_mobile_app/app/index.tsx` is the entry point.

```tsx
// app/index.tsx
const { user, isLoading, membership, isMembershipLoading } = useAuth();
```

### [50ms] `useAuth()` wakes up inside `AuthContext.tsx`

**What happens:**
- `AuthContext` checks AsyncStorage for a cached Supabase session.
- If found, it restores the session WITHOUT hitting the network.
- If not found, it redirects to `/login`.

```tsx
// context/AuthContext.tsx
const session = await supabase.auth.getSession();
// Also loads cached membership from AsyncStorage
const cached = await AsyncStorage.getItem(`${MEMBERSHIP_CACHE_PREFIX}${userId}`);
```

### [200ms] Membership hydration (if cache miss)

**What happens:**
- If no cached membership, `AuthContext` fetches from Supabase:
  - `organization_memberships` — checks `is_active.eq.true`
  - `property_memberships` — checks `is_active.eq.true`
  - Extracts `org_id`, `role`, `allowed_property_ids`
- Stores it in AsyncStorage with 24-hour TTL.

```tsx
// context/AuthContext.tsx
const { data: orgData } = await supabase
  .from('organization_memberships')
  .select('role, organization:organizations(id, name)')
  .eq('user_id', userId)
  .or('is_active.eq.true,is_active.is.null')  // ← ONLY active memberships
  .limit(1)
  .maybeSingle();
```

**⚠️ GAP:** If a user is removed from the org (their row deleted or `is_active=false`), the query returns null. The app then shows "No Properties Assigned" instead of redirecting to login. BUT — if the user still has a cached membership in AsyncStorage (24h TTL), they bypass this check entirely until the cache expires. The auth flow does NOT re-validate the JWT against Supabase on every app launch.

### [500ms] `app/index.tsx` redirects you

**What happens:**
- If authenticated + membership loaded → redirect to `/property/{firstProperty.id}`
- The property dashboard renders.

```tsx
return <Redirect href={`/property/${firstProperty.id}`} />;
```

---

## Phase 1: Cassandra Screen Appears (2,000ms — 3,000ms)

### [2,000ms] You tap the Cassandra tab

**What happens:**
- `app/cassandra/index.tsx` mounts.
- The Orb appears. The connection pill says "Offline" (red dot).

```tsx
// app/cassandra/index.tsx
const { isConnected } = useAppStore(); // false initially
```

### [2,100ms] Health check starts polling

**What happens:**
- `useEffect` in `CassandraHomeScreen` calls `healthCheck()` every 5 seconds.

```tsx
const check = async () => {
  const ok = await healthCheck(); // GET /cassandra/health
  setIsConnected(ok);
};
intervalId = setInterval(check, 5000);
```

### [2,300ms] Fastify responds: "I'm alive"

**Network path:**
```
Expo App (port 8081)
  → Metro bundler
    → JavaScript fetch
      → WiFi / Cellular
        → Fastify Server (port 3001)
          → GET /cassandra/health
```

**What Fastify does:**
```typescript
// server/src/plugins/cassandra.ts
fastify.get('/cassandra/health', async () => {
  return {
    enabled: true,
    orchestrator_running: true,
    status: 'ok',
    version: '2.0.0',
    max_sessions: 100,
    session_ttl_seconds: 86400,
    max_validation_iterations: 3,
  };
});
```

### [2,500ms] Connection pill turns green: "Cassandra online"

**The Sidekick Face (the orb) is now alive.** It pulses gently.

**UI text shown:**
```tsx
// app/cassandra/index.tsx
const hints = {
  idle: 'Tap the orb to talk to Cassandra',
  connecting: 'Connecting…',
  authenticated: 'Ready — tap to speak',
  recording: 'Listening… speak now',
  processing: 'Cassandra is thinking…',
  speaking: 'Cassandra is speaking…',
  error: 'Something went wrong. Tap to retry.',
};
```

**⚠️ There is NO intro message.** Cassandra does NOT say "Hey, this is Cassandra, your facilities assistant…" when you open the screen. The first time you see Cassandra speak is ONLY after you send your first message.

---

## Phase 2: You Send a Message (3,000ms — 3,100ms)

### [3,000ms] You type: "Show me critical tickets at SS Plaza"

**What happens:**
- You hit Send.
- `CassandraSessionModal.tsx` calls `handleSend("Show me critical tickets at SS Plaza")`.

### [3,010ms] State Gate #1: Is org_id present?

```tsx
// components/cassandra/CassandraSessionModal.tsx
if (!orgId) {
  toast.error('Organization context missing. Please log in again.');
  return;
}
```

**If NO org_id** → Toast error. Message blocked.
**If YES** → Proceed.

### [3,020ms] State Gate #2: Is a property selected?

```tsx
if (userProperties.length > 0 && !selectedPropertyId && !propertyId) {
  toast.info('Please select a property first.');
  return;
}
```

**If NO property selected** → Toast. Message blocked.
**If YES** → Proceed.

### [3,030ms] UI switches to Chat view

```tsx
setView('chat');          // Switch from orb view to chat bubbles
setIsTyping(true);        // Show "Cassandra is typing…"
setIsReasoningActive(true); // Show reasoning bubble
setReasoningSteps([]);    // Clear previous reasoning
```

### [3,040ms] `streamChat()` is invoked

```tsx
// components/cassandra/CassandraSessionModal.tsx
streamChat(
  message,                          // "Show me critical tickets at SS Plaza"
  currentSessionId ?? sessionId,    // e.g. "sess_abc123"
  (token) => { /* onToken — append answer text */ },
  async () => { /* onDone — finalize message */ },
  (err) => { /* onError — show error */ },
  abortRef.current.signal,          // AbortController for cancellation
  {
    propertyId: selectedPropertyId,
    allowedPropertyIds: ["prop_1", "prop_2"],
    conversationHistory: [
      { role: "user", content: "Previous message" },
      { role: "cassandra", content: "Previous answer" }
    ]
  },
  (step) => { /* onReasoning — append reasoning step */ }
);
```

---

## Phase 3: The JWT Handshake (3,100ms — 3,300ms)

### [3,100ms] `streamChat()` gets your Supabase session

```typescript
// services/cassandra/chat.ts
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session?.access_token) {
    onError("Please sign in again.");
    return;
  }
  // session.access_token = eyJhbGciOiJIUzI1NiIs...
});
```

**This JWT contains:**
- `sub`: your user_id
- `org_id`: your organization
- `role`: tenant / org_admin / mst
- `exp`: expiration timestamp

### [3,150ms] `streamChat()` builds the request body

```typescript
const body = {
  message: "Show me critical tickets at SS Plaza",
  context: {
    user_id: "user_a",
    org_id: "org_a",
    role: "tenant",
    allowed_property_ids: ["prop_1", "prop_2"],
    property_id: "prop_1"
  },
  conversation_history: [
    { role: "user", content: "Previous message" },
    { role: "cassandra", content: "Previous answer" }
  ]
};
```

### [3,200ms] `XMLHttpRequest` opens to Fastify

```typescript
const xhr = new XMLHttpRequest();
xhr.open("POST", `${BASE_URL}/chat/stream`);  // http://server:3001/chat/stream
xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
xhr.setRequestHeader("Content-Type", "application/json");
xhr.timeout = 60000; // 60 seconds for streaming
```

---

## Phase 4: Fastify Receives the Call (3,300ms — 3,500ms)

### [3,300ms] Request hits `POST /cassandra/chat/stream`

**Network path:**
```
Expo App
  → POST /cassandra/chat/stream
    → Fastify (port 3001)
      → cassandraPreHandler() runs FIRST
```

### [3,320ms] `cassandraPreHandler()` extracts identity

```typescript
// server/src/plugins/cassandra.ts
async function cassandraPreHandler(request, reply) {
  // Skip auth for health endpoints
  if (request.url === '/cassandra/health') return;

  // Dev mode? Use mock identity
  if (config.devMode && process.env.CASSANDRA_DEV_MODE === 'true') {
    request.state = { identity: DEV_IDENTITY };
    return;
  }

  // Production: verify JWT signature with HMAC-SHA256
  const token = extractBearerToken(request.headers.authorization);
  const payload = await verifyJwtSignature(token, process.env.SUPABASE_JWT_SECRET);

  // Check expiration
  if (payload.exp < Date.now() / 1000) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'JWT has expired' });
    return;
  }

  // Check org_id exists
  const orgId = payload.org_id || payload.organization_id;
  if (!orgId) {
    reply.status(400).send({ error: 'MISSING_ORG_ID' });
    return;
  }

  // Store identity in request state
  request.state = {
    identity: {
      userId: payload.sub,
      orgId: orgId,
      email: payload.email,
      role: payload.role || 'tenant'
    }
  };
}
```

### [3,400ms] Fastify proxies to Python

```typescript
// server/src/plugins/cassandra.ts
fastify.post('/cassandra/chat/stream', async (request, reply) => {
  const identity = request.state.identity; // From preHandler

  // Forward auth header to Python
  const authHeader = request.headers.authorization;
  const upstream = await fetch(
    `http://localhost:8000/chat/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,  // FIX C0-09
      },
      body: JSON.stringify({
        message: body.message,
        context: {
          user_id: identity.userId,
          org_id: identity.orgId,
          role: identity.role,
          allowed_property_ids: []
        },
        conversation_history: body.conversation_history
      })
    }
  );

  // Stream Python's response back to Expo
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reply.raw.write(value);  // Forward each SSE chunk
  }
});
```

---

## Phase 5: Python Orchestrator Awakens (3,500ms — 3,600ms)

### [3,500ms] `POST /chat/stream` hits Python FastAPI

```python
# cassandra/orchestrator/api_server.py
@app.post("/chat/stream")
async def chat_stream(request: StreamChatRequest):
    org_id = request.context.get("org_id", "")
    user_id = request.context.get("user_id", "")
    role = request.context.get("role", "tenant")

    # HARD BOUNDARY: No org_id = instant rejection
    if not org_id:
        return StreamingResponse(
            iter([_sse_format("error", {"code": "MISSING_ORG_ID"})]),
            media_type="text/event-stream"
        )

    # Rate limit check
    rate_limiter = _init_rate_limiter()
    if rate_limiter:
        limit_result = rate_limiter.check(user_id, org_id, role)
        if not limit_result.allowed:
            return StreamingResponse(..., status_code=429)

    # Enter the Master Loop
    return StreamingResponse(
        _stream_chat_generator(
            message=request.message,
            org_id=org_id,
            user_id=user_id,
            role=role,
            allowed_property_ids=request.context.get("allowed_property_ids", []),
            conversation_history=request.conversation_history,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )
```

### [3,550ms] `_stream_chat_generator()` starts the Master Loop

```python
async def _stream_chat_generator(message, org_id, user_id, role, ...):
    from cassandra.orchestrator.master_loop import Orchestrator, OrchestratorConfig

    config = OrchestratorConfig(
        org_id=org_id,
        user_id=user_id,
        role=role,
        tools=[{"name": "sql_engine"}, {"name": "fetch_context"}, {"name": "create_ticket"}],
        max_validation_iterations=3,
    )

    orchestrator = Orchestrator(config)
    stream_gen = orchestrator.run_stream(message, conversation_history)

    for chunk in stream_gen:
        yield _sse_format(chunk.event, chunk.data)
        await asyncio.sleep(0)  # Let event loop breathe
```

---

## Phase 6: The 7-Agent Master Loop (3,600ms — 6,000ms)

### [3,600ms] **AGENT 1: INTENT** — "What does the user want?"

```python
# master_loop.py
def run_stream(self, message, history):
    yield self._chunk("reasoning", {"step": "perception", "message": "Understanding..."})

    ctx.current_stage = LoopStage.INTENT
    yield self._chunk("reasoning", {"step": "intent", "message": "Identifying intent..."})

    intent = agents["intent"].run(message=message, current_timestamp=now)
    # intent.intent.value = "query_tickets"
    # intent.clarification_needed = False
```

**What the Intent Agent does:**
- Classifies the message into an intent: `query_tickets`, `create_ticket`, `query_budget`, `recall_memory`, etc.
- Extracts entities: `{ "property_id": null, "priority": "critical" }`

**SSE event sent to Expo:**
```
event: reasoning
data: {"step": "intent", "message": "Identifying intent..."}
```

**UI effect:** Reasoning bubble updates: "Identifying intent…"

---

### [3,900ms] **AGENT 2: CONTEXT** — "Who is this user?"

```python
ctx.current_stage = LoopStage.CONTEXT
yield self._chunk("reasoning", {"step": "context", "message": "Loading context..."})

ctx_result = agents["context"].run(
    user_id=ctx.user_id,
    org_id=ctx.org_id,
    role=ctx.role,
    conversation_history=history
)
ctx.allowed_property_ids = ctx_result.allowed_property_ids
# ctx.allowed_property_ids = ["prop_1", "prop_2"]
```

**What the Context Agent does:**
- Loads user's membership data
- Gets `allowed_property_ids` (what properties they can see)
- Gets role (tenant / org_admin / mst)

**SSE event:**
```
event: reasoning
data: {"step": "context", "message": "Loading context..."}
```

**UI effect:** Reasoning bubble updates: "Loading context…"

---

### [4,200ms] **AGENT 3: PERMISSION** — "Is this user allowed?"

```python
ctx.current_stage = LoopStage.PERMISSION
yield self._chunk("reasoning", {"step": "permission", "message": "Checking permissions..."})

permission = agents["permission"].verify_request(
    user_id=ctx.user_id,
    org_id=ctx.org_id,
    role=ctx.role,
    requested_org_id=ctx.org_id
)

if not permission.allowed:
    yield self._chunk("answer", {"text": "Permission denied"})
    yield self._chunk("done", {...})
    return
```

**What the Permission Agent does:**
- Verifies the user's `org_id` matches the request context
- Cross-tenant attempts are BLOCKED here
- Role checks: Can a `tenant` run `org_admin` tools? No.

**If blocked:** Stream ends with `"Permission denied"`.
**If allowed:** Continue.

**SSE event:**
```
event: reasoning
data: {"step": "permission", "message": "Checking permissions..."}
```

---

### [4,500ms] **AGENT 4: RETRIEVAL** — "What data do I need?"

```python
ctx.current_stage = LoopStage.RETRIEVAL
yield self._chunk("reasoning", {"step": "retrieval", "message": "Searching..."})

property_id = self._resolve_property(ctx, intent)
# If user has only 1 property → auto-select it
# If user says "SS Plaza" but no fuzzy match → property_id = None

retrieval = agents["retrieval"].run(
    query=message,
    org_id=ctx.org_id,
    property_id=property_id,
    intent_type=intent.intent.value,
    conversation_history=history
)
# retrieval.ticket_results = [...]
# retrieval.cited_sources = ["ticket:123", "ticket:456"]
```

**What the Retrieval Agent does:**
- Queries the database (via Supermemory or SQL)
- Gets tickets, work orders, assets, memories
- Returns `cited_sources` for attribution

**SSE event:**
```
event: reasoning
data: {"step": "retrieval", "message": "Searching..."}
```

---

### [4,800ms] **AGENT 5: REASONING** — "What should I do?"

```python
ctx.current_stage = LoopStage.REASONING
yield self._chunk("reasoning", {"step": "reasoning", "message": "Synthesizing..."})

reasoning = agents["reasoning"].run(
    user_message=message,
    retrieval_result=retrieval,
    intent_type=intent.intent.value,
    org_id=ctx.org_id,
    user_id=ctx.user_id,
    property_id=property_id
)

# reasoning.tool_calls = [
#   {"name": "sql_engine", "arguments": {
#     "query": "SELECT * FROM tickets WHERE organization_id = 'org_a' AND status = 'critical' LIMIT 10"
#   }}
# ]
# reasoning.answer_ready = False (needs tool execution)
```

**What the Reasoning Agent does:**
- Decides if tool calls are needed
- Builds SQL queries (with `organization_id` in WHERE clause — now mandated)
- Plans `create_ticket` if a commitment is detected
- Sets `answer_ready = True/False`

**SSE event:**
```
event: reasoning
data: {"step": "reasoning", "message": "Synthesizing..."}
```

---

### [5,100ms] **TOOL EXECUTION** — "Run the tools"

```python
if reasoning.tool_calls:
    ctx.current_stage = LoopStage.ACTION
    ctx.turn_count += 1

    tool_calls = [
        ToolCall(name=tc["name"], arguments=tc.get("arguments", {}), call_id=f"call_{i}")
        for i, tc in enumerate(reasoning.tool_calls)
    ]

    for tc in tool_calls:
        yield self._chunk("tool_start", {"tool": tc.name})
        # UI: "Running sql_engine…"

    ctx.tool_results = self.harness.execute_batch(tool_calls, ctx)
    # Harness.TOOL_TIMEOUT_S = 30 seconds hard limit

    for tr in ctx.tool_results:
        yield self._chunk("tool_result", {
            "tool": tr.tool_name,
            "success": tr.success,
            "message": tr.error or "Done"
        })
        # UI: "sql_engine completed" or "sql_engine failed"
```

**What the Harness does:**
- Runs each tool in a `ThreadPoolExecutor` with 30s timeout
- `SQLEngineTool` generates SQL → SQL Guard validates → executes
- `CreateTicketTool` inserts into database
- `FetchContextTool` gets membership metadata

**SQL Guard check (CRITICAL):**
```python
guard = SQLGuard(org_id=context.org_id)
guard_result = guard.validate(query)

if not guard_result.allowed:
    return ToolResult(success=False, error="SQL_GUARD_BLOCKED: ORGS_ID_MISSING")
```

**If SQL is missing `organization_id`:** BLOCKED. Error fed back to model.

**SSE events:**
```
event: tool_start
data: {"tool": "sql_engine"}

event: tool_result
data: {"tool": "sql_engine", "success": true, "message": "Done"}
```

---

### [5,400ms] **AGENT 6: VALIDATION LOOP** — "Is this answer correct?"

```python
answer = reasoning.answer_preview if reasoning.answer_ready else reasoning.plan

for i in range(1, ctx.max_validation_iterations + 1):  # Max 3 iterations
    ctx.current_stage = LoopStage.VALIDATION
    yield self._chunk("validation", {
        "iteration": i,
        "message": f"Validating ({i}/{ctx.max_validation_iterations})..."
    })

    validation = agents["validation"].validate(
        answer=answer,
        tool_results=tool_dicts,
        cited_sources=retrieval.cited_sources,
        user_role=ctx.role,
        org_id=ctx.org_id,
        property_id=property_id,
        iteration=i,
        reasoning_agent_output=reasoning
    )

    if validation.passed:
        answer = validation.final_answer or answer
        yield self._chunk("validation", {
            "iteration": i,
            "message": "Verified ✓",
            "passed": True
        })
        break

    # Failed — self-correct
    errors = "; ".join(validation.errors[:3])
    yield self._chunk("validation", {
        "iteration": i,
        "message": "Correcting...",
        "passed": False
    })
    answer = f"[SELF-CORRECT {i}/3] Errors: {errors}\nPlease correct."

else:  # All 3 iterations failed
    yield self._chunk("validation", {
        "iteration": 3,
        "message": "Using fallback",
        "passed": False
    })
    validation = agents["validation"].generate_fallback_answer(...)
    answer = validation.final_answer
```

**What the Validation Agent checks:**
- Grounding: Is the answer based on retrieved data?
- Accuracy: No hallucinated ticket IDs
- Policy: No sensitive data leakage
- Internal leakage: No SQL fragments, no `HARNESS`/`SQL_GUARD` terms
- Citations: Are sources properly attributed?

**If validation fails:** Errors are fed back internally. The model self-corrects.
**If all 3 fail:** Fallback answer generated (safe, generic response).

**SSE events:**
```
event: validation
data: {"iteration": 1, "message": "Validating (1/3)...", "passed": false}

event: validation
data: {"iteration": 1, "message": "Correcting...", "passed": false}

event: validation
data: {"iteration": 2, "message": "Verified ✓", "passed": true}
```

---

### [5,700ms] **AGENT 7: RESPONSE** — "Format the final answer"

```python
ctx.current_stage = LoopStage.RESPONSE
yield self._chunk("reasoning", {"step": "response", "message": "Formatting..."})

response = agents["response"].format(
    answer=answer,
    cited_sources=retrieval.cited_sources,
    tool_results=tool_dicts,
    intent_type=intent.intent.value,
    user_role=ctx.role,
    confidence=reasoning.confidence,
    fallback_triggered=validation.fallback_triggered
)

# response.answer = "You have 3 critical tickets at SS Plaza:\n\n🟢 #123 — Leak in basement\n🔵 #124 — AC failure\n🟢 #125 — Elevator maintenance"
# response.citations = [{"type": "ticket", "id": "123"}, ...]
# response.internal_trace = { "sanitized": true, "leaks_detected": false }
```

**What the Response Agent does:**
- `sanitize()` strips SQL fragments, UUIDs, internal terms
- Formats Markdown with emojis
- Adds citations block: "**Sources:** Ticket #123, Ticket #124"
- Adds follow-up suggestions

**SSE events:**
```
event: reasoning
data: {"step": "response", "message": "Formatting..."}

event: answer
data: {"text": "You have 3 critical tickets at SS Plaza..."}

event: citation
data: {"sources": [{"type": "ticket", "id": "123"}, ...]}

event: done
data: {"response": "...", "turns": 1, "validation_passed": true, ...}
```

---

## Phase 7: The Answer Streams Back (5,700ms — 6,000ms)

### [5,700ms] SSE chunks arrive at Expo

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: reasoning
data: {"step": "intent", "message": "Identifying intent..."}

event: reasoning
data: {"step": "context", "message": "Loading context..."}

event: reasoning
data: {"step": "permission", "message": "Checking permissions..."}

event: reasoning
data: {"step": "retrieval", "message": "Searching..."}

event: reasoning
data: {"step": "reasoning", "message": "Synthesizing..."}

event: tool_start
data: {"tool": "sql_engine"}

event: tool_result
data: {"tool": "sql_engine", "success": true, "message": "Done"}

event: validation
data: {"iteration": 1, "message": "Verified ✓", "passed": true}

event: reasoning
data: {"step": "response", "message": "Formatting..."}

event: answer
data: {"text": "You have 3 critical tickets at SS Plaza..."}

event: citation
data: {"sources": [...]}

event: done
data: {}
```

### [5,720ms] `SSEParser` in `chat.ts` processes each chunk

```typescript
class SSEParser {
  append(chunk: string): SSEEvent[] {
    // Buffer partial lines
    // Parse "event:" and "data:" lines
    // Emit structured events
  }
}
```

### [5,750ms] UI updates in real-time

**For each `event: reasoning`:**
```tsx
onReasoning(step) => {
  setReasoningSteps(prev => [...prev, step]);
}
// ReasoningBubble shows:
// • Identifying intent…
// • Loading context…
// • Checking permissions…
// • Searching…
// • Synthesizing…
// • Running sql_engine…
// • sql_engine completed
// • Answer verified ✓ (attempt 1)
// • Formatting…
```

**For `event: answer`:**
```tsx
onToken(text) => {
  fullResponse += text;
  setCurrentResponse(fullResponse);
}
// Chat bubble appears with the answer
```

**For `event: citation`:**
```tsx
onCitation(sources) => {
  // Sources shown below the answer
}
```

### [6,000ms] `event: done` — Stream complete

```tsx
onDone() => {
  setIsTyping(false);          // Hide "Cassandra is typing…"
  setIsReasoningActive(false); // Hide reasoning bubble
  addMessage({
    role: 'cassandra',
    text: fullResponse,
    reasoningSteps: reasoningSteps,
  });
}
```

---

## Phase 8: The Orb Speaks (if voice mode)

### [6,100ms] Text-to-Speech kicks in

```tsx
if (inputMode === 'voice') {
  setVoiceState('speaking');
  await speak(fullResponse);  // Expo Speech.speak()
  setVoiceState('idle');
}
```

**The orb's face animates:**
- `state="speaking"` → mouth moves, violet glow
- After speech ends → returns to idle, gentle pulse

---

## Summary: The Complete Timeline

| Time | Phase | What Happens | File |
|------|-------|-------------|------|
| 0ms | App Launch | Expo runtime boots | `app/index.tsx` |
| 50ms | Auth | `useAuth()` checks AsyncStorage | `context/AuthContext.tsx` |
| 200ms | Membership | Hydrate org_id, role, property_ids | `context/AuthContext.tsx` |
| 500ms | Redirect | Go to property dashboard | `app/index.tsx` |
| 2,000ms | Cassandra Tab | Orb screen mounts | `app/cassandra/index.tsx` |
| 2,100ms | Health Poll | `healthCheck()` every 5s | `app/cassandra/index.tsx` |
| 2,300ms | Server Response | Fastify `/cassandra/health` → 200 | `plugins/cassandra.ts` |
| 2,500ms | Online | Connection pill turns green | `app/cassandra/index.tsx` |
| 3,000ms | User Sends | Tap Send / Speak | `CassandraSessionModal.tsx` |
| 3,010ms | State Gate #1 | Check org_id exists | `CassandraSessionModal.tsx` |
| 3,020ms | State Gate #2 | Check property selected | `CassandraSessionModal.tsx` |
| 3,040ms | streamChat() | Build request body | `services/cassandra/chat.ts` |
| 3,100ms | JWT | `supabase.auth.getSession()` | `services/cassandra/chat.ts` |
| 3,200ms | XHR | `POST /cassandra/chat/stream` | `services/cassandra/chat.ts` |
| 3,300ms | Fastify | `cassandraPreHandler()` extracts identity | `plugins/cassandra.ts` |
| 3,400ms | Proxy | Forward to Python `:8000/chat/stream` | `plugins/cassandra.ts` |
| 3,500ms | Python | `/chat/stream` receives request | `api_server.py` |
| 3,550ms | Loop Start | `_stream_chat_generator()` begins | `api_server.py` |
| 3,600ms | Agent 1 | Intent classification | `master_loop.py` + `intent.py` |
| 3,900ms | Agent 2 | Context loading | `master_loop.py` + `context.py` |
| 4,200ms | Agent 3 | Permission check | `master_loop.py` + `permission.py` |
| 4,500ms | Agent 4 | Data retrieval | `master_loop.py` + `retrieval.py` |
| 4,800ms | Agent 5 | Reasoning / plan tools | `master_loop.py` + `reasoning.py` |
| 5,100ms | Tools | SQL execution / ticket creation | `harness.py` + `sql_engine.py` |
| 5,400ms | Agent 6 | Validation loop (max 3) | `master_loop.py` + `validation.py` |
| 5,700ms | Agent 7 | Response formatting | `master_loop.py` + `response.py` |
| 5,720ms | SSE | Events stream back to Expo | `chat.ts` + `SSEParser` |
| 5,750ms | UI | Reasoning bubble + answer render | `CassandraSessionModal.tsx` |
| 6,000ms | Done | Message persisted, typing stops | `CassandraSessionModal.tsx` |
| 6,100ms | Voice | TTS speaks (if voice mode) | `useTextToSpeech.ts` |

---

## What Cassandra Does NOT Do (Honest Gaps)

| Gap | Where | Impact |
|-----|-------|--------|
| **No intro message** | `app/cassandra/index.tsx` | Cassandra is silent until you send the first message. No "Hey, I'm Cassandra…" |
| **No membership re-validation on launch** | `AuthContext.tsx` | Cached membership (24h TTL) can let removed users access the app until cache expires |
| **No fuzzy property matching** | `master_loop.py _resolve_property()` | "SS Plaza" is NOT matched to `property_id`. Only exact IDs or auto-select (if 1 property) work |
| **No real-time eviction of removed users** | `AuthContext.tsx` | If an admin removes a user, they stay logged in until JWT expires or cache clears |

---

## Critical Ports & Connections

| Component | Port | Protocol | Connects To |
|-----------|------|----------|-------------|
| Expo App (Metro) | 8081 | HTTP (dev) | Bundles JS to device |
| Fastify Server | 3001 | HTTP | Receives API calls from Expo |
| Python Orchestrator | 8000 | HTTP | Receives proxied calls from Fastify |
| Supabase Auth | 443 | HTTPS | JWT validation, user data |
| Supabase DB | 5432 | PostgreSQL | Tickets, properties, users |

---

## What Data Flows Where?

### From Expo → Fastify
```json
{
  "message": "Show me critical tickets at SS Plaza",
  "context": {
    "user_id": "user_a",
    "org_id": "org_a",
    "role": "tenant",
    "allowed_property_ids": ["prop_1", "prop_2"],
    "property_id": "prop_1"
  },
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "cassandra", "content": "..." }
  ]
}
```

### From Fastify → Python
```json
{
  "message": "Show me critical tickets at SS Plaza",
  "context": {
    "user_id": "user_a",
    "org_id": "org_a",
    "role": "tenant",
    "allowed_property_ids": []
  },
  "conversation_history": [...]
}
```

### From Python → Expo (SSE)
```
event: reasoning → "Identifying intent…"
event: reasoning → "Loading context…"
event: reasoning → "Checking permissions…"
event: reasoning → "Searching…"
event: reasoning → "Synthesizing…"
event: tool_start → "sql_engine"
event: tool_result → {"tool": "sql_engine", "success": true}
event: validation → {"iteration": 1, "passed": true}
event: reasoning → "Formatting…"
event: answer → {"text": "You have 3 critical tickets..."}
event: citation → {"sources": [...]}
event: done → {}
```

---

## Failure Scenarios

| Scenario | Where It Fails | What User Sees |
|----------|---------------|----------------|
| No org_id | `handleSend()` State Gate | Toast: "Organization context missing" |
| No property selected | `handleSend()` State Gate | Toast: "Please select a property first" |
| JWT expired | `cassandraPreHandler()` | 401 + "JWT has expired" |
| Cross-tenant attempt | `permission.py` Agent | 403 + "Permission denied" |
| SQL missing org_id | `sql_guard.py` | `SQL_GUARD_BLOCKED: ORGS_ID_MISSING` |
| Tool timeout (30s) | `Harness.execute_tool()` | `TOOL_TIMEOUT: sql_engine exceeded 30s` |
| Validation fails 3x | `validation.py` Loop | Fallback safe answer |
| Mid-stream crash | `api_server.py` try/except | `event: error` + "Please try again" |
| Server offline | `healthCheck()` | "Offline" red pill |
| Rate limit exceeded | `rate_limiter.py` | 429 + "Rate limit exceeded" |

---

## The Chain of Thought is Not Magic

Every time you see the reasoning bubble animate, this is the EXACT sequence of code running:

1. `yield StreamChunk("reasoning", {"step": "intent", "message": "Identifying intent..."})`
2. `agents["intent"].run(message, timestamp)` ← synchronous LLM call
3. `yield StreamChunk("reasoning", {"step": "context", "message": "Loading context..."})`
4. `agents["context"].run(user_id, org_id, role, history)` ← DB query
5. `yield StreamChunk("reasoning", {"step": "permission", "message": "Checking permissions..."})`
6. `agents["permission"].verify_request(...)` ← org_id match check
7. `yield StreamChunk("reasoning", {"step": "retrieval", "message": "Searching..."})`
8. `agents["retrieval"].run(query, org_id, property_id, ...)` ← DB query
9. `yield StreamChunk("reasoning", {"step": "reasoning", "message": "Synthesizing..."})`
10. `agents["reasoning"].run(message, retrieval, ...)` ← decides tools
11. `yield StreamChunk("tool_start", {"tool": "sql_engine"})`
12. `harness.execute_batch(tool_calls, ctx)` ← runs SQL
13. `yield StreamChunk("tool_result", {"tool": "sql_engine", "success": true})`
14. `yield StreamChunk("validation", {"iteration": 1, "passed": true})`
15. `agents["validation"].validate(answer, ...)` ← checks quality
16. `yield StreamChunk("answer", {"text": "You have 3 critical tickets..."})`
17. `yield StreamChunk("done", {...})`

**The bubble is not a fake loading animation.** It is a real-time window into the Master Loop's brain.
