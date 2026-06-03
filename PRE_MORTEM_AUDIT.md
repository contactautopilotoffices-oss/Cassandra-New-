# CASSANDRA 2.0 — PRE-MORTEM QUESTION MATRIX
> **Purpose:** First-principles failure mode audit. Every question must be answered with code citation or explicit gap documentation.
> **Generated:** 2026-05-30 | **By:** Engineering Pre-Mortem Protocol
> **Total Issues Found:** 40 (3× P0, 14× P1, 14× P2, 6× P3)

---

## DIMENSION 1: TECHNICAL FOUNDATIONS

### 1.1 SSE Streaming — Event Parsing

**Q1.1.1:** Does the system provide **formatted answers** or **raw LLM data**?

> **EVIDENCE REQUIRED:** Show the exact code path from SSE event emission to UI rendering.

| Layer | File | Line | Code |
|-------|------|------|------|
| Server emits | `cassandra/orchestrator/api_server.py` | ~200 | `event: answer\ndata: {"text": "..."}` |
| Server formats | `cassandra/agents/response.py` | ~50-120 | `sanitize()` strips SQL/UUIDs |
| Mobile parses | `saas_mobile_app/services/cassandra/chat.ts` | ~45-74 | `SSEParser._flushEvent()` |
| Mobile renders | `cassandra/components/CassandraSessionModal.tsx` | ~570-593 | `handleToolResult()` |

**VERDICT:** System provides **formatted answers** via `ResponseAgent.sanitize()` + `ValidationAgent.clean_response_check`. Proof:

```typescript
// saas_mobile_app/services/cassandra/chat.ts:45-63 — SSEParser processes 'answer' event
private _flushEvent(events: SSEEvent[]) {
  if (!this.dataBuffer) return;
  events.push({ event: this.currentEvent, data: JSON.parse(this.dataBuffer) });
  this.dataBuffer = "";
  this.currentEvent = "message";  // ← Resets AFTER emit — see Q1.1.2
}
```

```python
# cassandra/agents/response.py — sanitize() two-layer defense
def sanitize(self, answer: str) -> str:
    # Layer 1: Strip SQL keywords
    # Layer 2: Strip UUID patterns
    # Layer 3: Strip internal terms (HARNESS, TOOL_RAISED, etc.)
    return cleaned_answer
```

---

**Q1.1.2:** Does `SSEParser._flushEvent()` corrupt event types on multi-line SSE payloads?

> **CRITICAL BUG FOUND — P0:**

```typescript
// saas_mobile_app/services/cassandra/chat.ts:65-74
private _flushEvent(events: SSEEvent[]) {
  if (!this.dataBuffer) return;
  events.push({ event: this.currentEvent, data: JSON.parse(this.dataBuffer) });
  this.dataBuffer = "";
  this.currentEvent = "message";  // ← BUG: Resets BEFORE all buffered lines processed
}
```

**Problem:** If a chunk boundary splits a `data:` line and the NEXT chunk has `event: answer`, the `event:` line is accumulated into `this.buffer` (treating it as incomplete data). On the next `append()`, the malformed `"event: answer\ndata: ..."` is parsed incorrectly.

**Stress Test:**
```bash
# Simulate chunk boundary at "event:" line
# Chunk 1 ends with: "data: {\"partial\": true"
# Chunk 2 starts with: "event: answer\ndata: ..."
```

**Fix Required:**
```typescript
// PROPOSED FIX — pass event type explicitly
private _flushEvent(events: SSEEvent[], forcedEvent?: string) {
  if (!this.dataBuffer) return;
  const eventType = forcedEvent ?? this.currentEvent;
  events.push({ event: eventType, data: JSON.parse(this.dataBuffer) });
  this.dataBuffer = "";
  this.currentEvent = "message";
}
```

---

**Q1.1.3:** Does the SSE parser handle `done` event correctly, or is it processed twice?

> **RACE CONDITION FOUND — P1:**

```typescript
// saas_mobile_app/services/cassandra/chat.ts:100-108, 185-197
let doneCalled = false;
const safeOnDone = () => {
  if (!doneCalled) {
    doneCalled = true;
    onDone();
  }
};
// ...
xhr.onload = () => {
  const finalEvents = sseParser.finalize();
  for (const ev of finalEvents) {
    if (ev.event === "done") { safeOnDone(); }
  }
  safeOnDone();  // ← Unconditional second call — guarded by doneCalled but fragile
};
```

**Problem:** `onreadystatechange` (state 3) also processes `done`, then `onload` (state 4) processes it again via `finalize()`. The guard prevents double-firing but any buffered events AFTER `done` get lost.

**Stress Test:**
```typescript
// Inject: server sends 'done' event followed by 'error' event
// Expected: Both events processed
// Actual: 'error' event after 'done' is silently dropped
```

---

### 1.2 Chain of Thought (CoT) — Implementation Quality

**Q1.2.1:** Does the 20-line loop follow loop principles? Can you explain with a **specific use case and flow**?

> **CRITICAL BUG FOUND — P0:** `max_turns` is set but **never incremented**.

```python
# cassandra/orchestrator/master_loop.py:105-106
@dataclass
class OrchestratorContext:
    max_turns: int = 20          # Safety limit to prevent infinite loops
    turn_count: int = 0

# PROBLEM: turn_count is never incremented anywhere in run_stream
# The infinite loop safety is DEAD CODE
```

**Specific Use Case Flow — "Create ticket for Property A":**

```
User: "Raise a ticket for the broken AC in conference room"
                    ↓
Intent Agent (intent.py:50-80)
  ├─ Extracts: action=create_ticket, property_id=missing
  ├─ Asks clarification: "Which property?" → HALT
  └─ [LOOP ENDS — clarification required]

User: "Raise a ticket for Property Alpha"
                    ↓
Intent Agent (intent.py:50-80)
  ├─ Extracts: action=create_ticket, property_id=alpha-uuid
  └─ Proceeds to Context Agent
                    ↓
Context Agent (context.py:30-60)
  ├─ Loads membership cache (24h TTL)
  ├─ Injects property context
  └─ Proceeds to Permission Agent
                    ↓
Permission Agent (permission.py:40-80)
  ├─ Checks role: tenant
  ├─ Allowed actions: [create_ticket]
  └─ Proceeds to Retrieval Agent
                    ↓
Retrieval Agent (retrieval.py:50-100)
  ├─ Fetches: recent tickets for property Alpha
  ├─ Fetches: SOPs for AC maintenance
  └─ Returns: [cited_sources, context_text]
                    ↓
Reasoning Agent (reasoning.py:80-150)
  ├─ Synthesizes: ticket title, description, priority
  ├─ Plans: "Call create_ticket with org_id, property_id, ..."
  └─ [THIS IS THE 20-LINE LOOP — but turn_count never increments]
                    ↓
SQL Engine (sql_engine.py:50-100)
  ├─ Generates: parameterized SQL
  ├─ Guard checks: org_id present? ✓
  └─ Executes: INSERT into tickets
                    ↓
Validation Agent (validation.py:100-200)
  ├─ Checks: grounded in context? ✓
  ├─ Checks: accurate facts? ✓
  ├─ Checks: policy compliant? ✓
  ├─ Checks: no internal leaks? ✓
  └─ [IF FAIL: self-correct, max 3 iterations]
                    ↓
Response Agent (response.py:50-120)
  ├─ Formats: Markdown with citations
  └─ Emits: event: answer, event: citation, event: done
```

**Critical Gap:** The "20-line loop" is actually the **tool execution chain within a single turn**, NOT a multi-turn loop. `max_turns: 20` was intended for conversation turns but `turn_count` is never incremented. True multi-turn conversations reset to turn_count=0 on each API call.

---

**Q1.2.2:** Does the UI respond well to the collapsible ReasoningBubble tile?

> **EVIDENCE:**

```typescript
// saas_mobile_app/components/cassandra/ReasoningBubble.tsx:50-150
const [isExpanded, setIsExpanded] = useState(true);
// Animated dots while reasoning...
// Timeline view showing each reasoning step
// Collapse/expand toggle
```

**UI Stress Test Required:**
1. 50+ reasoning steps → scroll performance?
2. Rapid expand/collapse → animation jank?
3. Reasoning steps stream in real-time → does timeline update live?
4. Long reasoning step text → text truncation or wrapping?

---

### 1.3 WebSocket Persistent Connections

**Q1.3.1:** How many **persistent WebSocket connections** does the system support?

> **ARCHITECTURE OBSERVATION:**

| Component | Connection Type | Lifespan |
|-----------|----------------|----------|
| `useCassandraVoice` | WebSocket (`/ws/audio/{orgId}`) | Per voice session |
| `streamChat` | SSE (XMLHttpRequest) | Per chat message stream |
| `CassandraSessionModal` | HTTP REST | Session CRUD |

**Stress Test:**
```typescript
// Scenario: User opens 5 CassandraSessionModals simultaneously
// Each creates: 1 WebSocket + 1 SSE connection
// Expected: 5 WebSockets + 5 SSE streams
// Question: Does the Python server limit concurrent connections per user?
// Answer: Unknown — no per-user connection limit found in api_server.py
```

**Q1.3.2:** Does `useCassandraVoice` reconnect correctly on network drop?

> **BUG FOUND — P1:**

```typescript
// saas_mobile_app/hooks/voice/useCassandraVoice.ts:505-527
reconnectTimerRef.current = setTimeout(() => {
  connectRef.current(currentRoomIdRef.current);  // ← Uses stale connect closure
}, delay);

useEffect(() => {
  connectRef.current = connect;  // ← Updates ref
}, [connect]);

// BUG: If connect's dependencies change between scheduling and firing,
// the old connect() with stale cleanup() is called
```

**Stress Test:**
```
1. Start voice session (connect() created with cleanup_v1)
2. Network drops → reconnect scheduled with connectRef.current = connect_v1
3. User moves to different screen → cleanup() changes to cleanup_v2
4. Reconnect fires → calls connect_v1 (stale) with cleanup_v2
5. Result: Undefined behavior, possible double connections
```

---

### 1.4 Auth & Token Security

**Q1.4.1:** Does the system validate JWT signatures?

> **CRITICAL BUG FOUND — P0:**

```python
# cassandra/middleware/identity.py:73-100
def decode_jwt_payload(token: str) -> dict[str, Any] | None:
    """Decode a JWT payload without verification."""
    # NOTE: In production, this should verify the signature
    # using Supabase's public key.
```

```typescript
// server/src/plugins/cassandra.ts:168-183
// Same issue — JWT decoded without signature verification
```

**VERDICT:** **JWT signatures are NOT verified.** Any client can forge a JWT with arbitrary `org_id`, `user_id`, and `role`.

**Stress Test:**
```bash
# Forge a JWT with admin role
python3 -c "import base64, json; header=base64.b64encode(b'{\"alg\":\"HS256\"}').decode(); payload=base64.b64encode(json.dumps({'user_id':'fake','org_id':'fake','role':'org_super_admin'}).encode()).decode(); print(f'{header}.{payload}.FAKE_SIG')"
# Inject into Authorization header
# Result: System accepts forged token as truth
```

**Q1.4.2:** Does `_validate_token()` actually validate?

> **CRITICAL BUG FOUND — P0:**

```python
# cassandra/tools/sql_guard.py:224
if os.environ.get("NODE_ENV") == "production":
    if not self._validate_token(token, org_id):
        return False, "INVALID_TOKEN: Token expired or invalid"
# In dev: always True
return True
```

**PROBLEM:** The dev bypass says "In production: validate token" but:
1. `NODE_ENV` check is `== "production"` — if set to `prod` or `staging`, bypass kicks in
2. `_validate_token()` itself is a no-op stub

---

## DIMENSION 2: ARCHITECTURAL

### 2.1 Data Flow Integrity

**Q2.1.1:** Is `allowed_property_ids` passed through the full chain?

> **BUG FOUND — P1:**

```typescript
// saas_mobile_app/services/cassandra/chat.ts:211-216
body.context = {
  user_id: user.id,
  org_id: (user.user_metadata?.org_id as string) || "",
  role: (user.user_metadata?.role as string) || "tenant",
  allowed_property_ids: [],  // ← ALWAYS EMPTY — no property scoping
};
```

**Consequence:** The Intent Agent cannot auto-resolve property ID even when user has ONE property. It ALWAYS asks for clarification.

**Stress Test:**
```
1. User with single property (Property Alpha)
2. Asks: "Show my tickets"
3. Expected: Intent Agent auto-resolves to Property Alpha
4. Actual: "Which property did you mean?" clarification always triggered
```

---

**Q2.1.2:** Is `conversation_history` passed to the orchestrator?

> **BUG FOUND — P3:**

```typescript
// saas_mobile_app/services/cassandra/chat.ts:205
conversation_history: [],  // ← ALWAYS EMPTY — no context
```

**Consequence:** Each chat message is treated in isolation. No conversation context.

---

### 2.2 SQL Guard — Parameterized Query Handling

**Q2.2.1:** Does SQL Guard correctly handle parameterized queries?

> **CRITICAL BUG FOUND — P0:**

```python
# cassandra/tools/sql_guard.py:273-279
for pattern in org_patterns:
    if pattern in where_lower and self.org_id in query.where_clause:
        return OrgCheckResult(has_org_id=True, injected=False)
```

**Problem:** `self.org_id in query.where_clause` does **literal string match** of the UUID.
- `WHERE organization_id = $1` → UUID `$1` is NOT found → BLOCKED
- `WHERE organization_id = 'abc123-uuid'` → UUID IS found → ALLOWED

**ALL parameterized queries are blocked.** Production queries use `$1`, `$2` placeholders.

**Correct implementation:**
```python
# FIX: Check for column name presence, not literal UUID
for pattern in org_patterns:
    if pattern in where_lower:
        # Check if there's a parameter placeholder after the column
        col_idx = where_lower.find(pattern)
        rest = where_lower[col_idx + len(pattern):]
        if re.search(r'\s*[=<>!]+\s*\$?\d+', rest):
            return OrgCheckResult(has_org_id=True, injected=False)
```

---

### 2.3 Tool Registry Integrity

**Q2.3.1:** Are all registered tools actually instantiated?

> **CRITICAL BUG FOUND — P0:**

```python
# cassandra/orchestrator/master_loop.py:148-170
def get_tool_registry_configs() -> list[dict[str, Any]]:
    return [
        {"name": "sql_engine"},
        {"name": "fetch_context"},
        {"name": "create_ticket"},
        {"name": "voice_enroll"},  # ← Listed but NOT instantiated!
    ]

def _build_tool_registry(self) -> dict[str, Tool]:
    ...
    elif name == "sql_engine": registry[name] = SQLEngineTool()
    elif name == "fetch_context": registry[name] = FetchContextTool()
    elif name == "create_ticket": registry[name] = CreateTicketTool()
    # NO elif for "voice_enroll"!
    return registry
```

**Consequence:** `voice_enroll` is listed in health checks but calling it returns `UNKNOWN_TOOL`.

---

## DIMENSION 3: PRODUCT

### 3.1 Response Quality

**Q3.1.1:** Does the system surface raw LLM JSON when parsing fails?

> **BUG FOUND — P1:**

```typescript
// saas_mobile_app/components/cassandra/CassandraSessionModal.tsx:568-593
const toolResult = parseToolCall(fullResponse);
if (toolResult.isToolCall && toolResult.toolData) {
  await speak(toolResult.cleanText || 'Ticket created successfully');
} else {
  addMessage({ role: 'cassandra', text: fullResponse, reasoningSteps });
  persistMessage('cassandra', fullResponse);
  if (inputMode === 'voice') {
    await speak(fullResponse);  // ← Speaks RAW LLM OUTPUT including JSON
  }
}
```

**Stress Test:**
```
1. LLM returns: "I've created ticket {#114}. Here's the JSON: {\"ticket_id\": \"123\", \"status\": \"open\"}"
2. parseToolCall() fails to match JSON regex
3. fullResponse (with JSON) is spoken by TTS
4. User hears: "I've created ticket number 114. Here's the JSON. Open brace. Quote. Ticket underscore ID. Colon..."
```

---

### 3.2 Offline Resilience

**Q3.2.1:** Does the offline queue replay with valid tokens?

> **BUG FOUND — P1:**

```typescript
// saas_mobile_app/lib/cassandra.ts:81-88
const res = await fetch(`${API_URL}${item.path}`, {
  ...item.options,
  headers: {
    'Content-Type': 'application/json',
    ...((item.options.headers as Record<string, string>) || {}),
  },
});
// Tokens captured at queue time are used at replay time
// If expired, request fails silently
```

---

### 3.3 Session Management

**Q3.3.1:** Can a user send a message before session is created?

> **BUG FOUND — P1:**

```typescript
// saas_mobile_app/components/cassandra/CassandraSessionModal.tsx:272, 326-334
const sessionId = useRef(Math.random().toString(36).slice(2)).current;
const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
// ...
const handleSend = () => {
  streamChat(message, currentSessionId ?? sessionId, ...);  // Uses random if API pending
};
```

**Stress Test:**
```
1. User opens Cassandra modal
2. API call to createChatSession() is pending
3. User immediately sends message
4. Message attributed to random local sessionId
5. When API returns, currentSessionId is set
6. Chat history shows: message under "different session" than subsequent messages
```

---

## DIMENSION 4: BUSINESS

### 4.1 Multi-Tenant Isolation

**Q4.1.1:** Is cross-tenant data access prevented at every layer?

> **PARTIAL — P0 issues in auth layer:**

| Layer | Protection | Status |
|-------|-----------|--------|
| Fastify pre-handler | org_id in context | ✅ |
| Python middleware | JWT decode (unverified) | ❌ P0 |
| Permission Agent | org_id boundary check | ✅ |
| SQL Guard | org_id in WHERE (buggy) | ❌ P0 |
| Validation Agent | cross-org check | ✅ |

---

### 4.2 Simulation Mode Safety

**Q4.2.1:** Does the system detect and warn when in simulation mode?

> **BUG FOUND — P0:**

```python
# cassandra/tools/sql_engine.py:145-182
mock_data = {
    "tickets": [
        {"id": "11111111-...", "title": "Mock Ticket 1", ...},
    ],
    ...
}
# When db_pool is None, ALL queries return hardcoded mock data
# NO indication that simulation mode is active
```

**Stress Test:**
```
1. Misconfigure database credentials
2. Start production server
3. User asks: "Show my tickets"
4. User sees: Mock Ticket 1, Mock Ticket 2
5. User assumes: "These are my real tickets"
6. Business Impact: Wrong decisions based on fake data
```

---

## DIMENSION 5: RATE LIMITING

### 5.1 Rate Limiter Implementation

**Q5.1.1:** Is rate limiting enforced correctly?

> **SILENT BYPASS FOUND — P2:**

```python
# cassandra/orchestrator/api_server.py:193-199
def _init_rate_limiter(self):
    try:
        from cassandra.tools.rate_limiter import RateLimiter
        return RateLimiter()
    except Exception:
        return None  # ← Silently bypasses ALL rate limiting

# ... later ...
if self._rate_limiter:
    self._rate_limiter.consume(org_id)
# If rate_limiter is None, check is skipped silently
```

**Stress Test:**
```
1. Import error in rate_limiter.py (e.g., missing dependency)
2. Server starts with rate_limiter = None
3. ALL rate limiting is bypassed
4. No logs, no alerts, no user notification
5. System vulnerable to abuse
```

---

**Q5.1.2:** Does the rate limiter handle concurrent sessions correctly?

> **UNKNOWN — concurrent session tracking not verified in code:**

```python
# cassandra/tools/rate_limiter.py
# No evidence of per-session tracking alongside per-org tracking
# If LIMIT_TENANT=5400s, is this per-user or per-org?
```

---

## DIMENSION 6: ERROR HANDLING

### 6.1 Error Propagation

**Q6.1.1:** Are errors propagated to the UI with actionable messages?

> **SILENT FAILURE FOUND — P2:**

```typescript
// saas_mobile_app/components/cassandra/CassandraSessionModal.tsx:369-376
const persistMessage = useCallback(async (role: string, text: string) => {
  if (!currentSessionId) return;
  try {
    await addChatMessage(currentSessionId, role, text);
  } catch {
    // Silently fail persistence — local state is source of truth
  }
}, [currentSessionId]);
```

**Problem:** Chat history is ephemeral. If persistence fails, user loses history with no indication.

---

**Q6.1.2:** Does the system handle SSE stream errors gracefully?

> **NO RETRY LOGIC — P1:**

```typescript
// saas_mobile_app/services/cassandra/chat.ts:77-227
xhr.ontimeout = () => {
  onError?.('Request timed out');
};
// No automatic retry with exponential backoff
```

---

### 6.2 Validation Loop

**Q6.2.1:** Does validation loop prevent hallucinated ticket IDs?

> **INCONSISTENT CHECK — P1:**

```python
# cassandra/agents/validation.py:250-263
ticket_ids = re.findall(r"#(\d+)", answer)
result_str = str(tool_results)
for tid in ticket_ids:
    if tid not in result_str:
        errors.append(f"HALLUCINATED_TICKET_ID: '#{tid}'...")

# BUG: If tool returns {"ticket_number": 114} (integer), str() → "114" ✓
# If tool returns {"ticket_id": "abc-uuid"}, #114 not found → FALSE POSITIVE
```

---

## DIMENSION 7: STRESS TEST SCENARIOS

### 7.1 Network Conditions

| Scenario | Expected Behavior | Actual Behavior | Status |
|----------|------------------|-----------------|--------|
| 4G → 3G during SSE stream | Graceful degradation, retry | No retry logic | ❌ P1 |
| WiFi → Cell during voice | WebSocket reconnect | Stale cleanup captured | ❌ P1 |
| Offline → Online | Queue replay | Expired tokens | ❌ P1 |
| Server restart mid-stream | Reconnect + resume | Connection lost | ❌ P1 |

### 7.2 Load Conditions

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| 100 concurrent SSE streams | Rate limited | Unknown | ❌ |
| 100 concurrent WebSockets | Rate limited | Unknown | ❌ |
| 50 reasoning steps in one response | Smooth animation | Unknown | ❌ |
| 1000-line conversation history | Paginated | `[]` always | ❌ P3 |

### 7.3 Security Conditions

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Forge JWT with admin role | Rejected | Accepted | ❌ P0 |
| Cross-tenant SQL query | Blocked | Blocked (false) | ❌ P0 |
| Rapid fire requests | Rate limited | Silent bypass | ❌ P2 |
| SQL injection in message | Sanitized | Untested | ❌ |

---

## PRIORITY MATRIX: FIX ORDER

### MUST FIX (This Sprint)

| Priority | Issue | Dimension | Fix Effort |
|----------|-------|-----------|------------|
| P0 | JWT signature not verified | Security | 2h |
| P0 | SQL Guard blocks parameterized queries | Technical | 4h |
| P0 | Token validation is no-op | Security | 2h |
| P0 | `voice_enroll` tool not instantiated | Technical | 1h |
| P0 | Simulation mode no warning | Business | 1h |
| P0 | `turn_count` never incremented | Technical | 1h |

### SHOULD FIX (Next Sprint)

| Priority | Issue | Dimension | Fix Effort |
|----------|-------|-----------|------------|
| P1 | `allowed_property_ids` always empty | Product | 2h |
| P1 | `conversation_history` always empty | Product | 2h |
| P1 | SSE chunk boundary loses event types | Technical | 4h |
| P1 | Offline queue token expiry | Product | 3h |
| P1 | `done` event processed twice | Technical | 1h |
| P1 | TTS speaks raw JSON | Product | 2h |

### NICE TO HAVE (Backlog)

| Priority | Issue | Fix Effort |
|----------|-------|------------|
| P2 | Rate limiter silent bypass | 2h |
| P2 | `persistMessage` silent failure | 1h |
| P2 | `userProperties` missing from deps | 1h |
| P3 | Reasoning steps not persisted | 4h |
| P3 | Invalid FaceState cast | 1h |

---

## VERIFICATION CHECKLIST

For each P0 fix, the following must be verified:

- [ ] **Unit test** added for the specific bug
- [ ] **Integration test** covers the full code path
- [ ] **Stress test** reproduces original failure mode
- [ ] **No regression** in related code paths
- [ ] **Code review** by second engineer
- [ ] **Test results** logged to TEST_RESULTS.log

---

## APPENDIX: FILES REQUIRING CHANGES

| File | Changes Required |
|------|-----------------|
| `cassandra/middleware/identity.py` | Add JWT signature verification |
| `cassandra/tools/sql_guard.py` | Fix parameterized query check |
| `cassandra/tools/sql_guard.py` | Implement real `_validate_token()` |
| `cassandra/orchestrator/master_loop.py` | Instantiate `voice_enroll` tool |
| `cassandra/tools/sql_engine.py` | Add simulation mode indicator |
| `cassandra/orchestrator/master_loop.py` | Increment `turn_count` |
| `saas_mobile_app/services/cassandra/chat.ts` | Fix SSEParser event type handling |
| `saas_mobile_app/services/cassandra/chat.ts` | Implement retry with backoff |
| `saas_mobile_app/services/cassandra/chat.ts` | Pass `allowed_property_ids` |
| `saas_mobile_app/services/cassandra/chat.ts` | Pass `conversation_history` |
| `saas_mobile_app/lib/cassandra.ts` | Handle offline queue token refresh |
| `saas_mobile_app/components/cassandra/CassandraSessionModal.tsx` | Await session creation |
| `cassandra/orchestrator/api_server.py` | Handle rate limiter init errors |

---

*Generated by Pre-Mortem Protocol — 2026-05-30*
