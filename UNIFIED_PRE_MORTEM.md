# UNIFIED PRE-MORTEM + STRESS TEST AUDIT
> **Sources:** Claude Audit (40 issues) + Kimi Stress Test Audit (37% pass rate)
> **Date:** 2026-05-30
> **Combined Score:** 8.5/23 = 37% (Kimi) + 40 issues found (Claude)
> **Status:** MUST FIX — 10 Critical Blockers from Kimi + 7 P0 from Claude = 17 total critical issues

---

## EXECUTIVE SUMMARY

| Auditor | Issues Found | Critical | High | Medium | Low |
|---------|-------------|----------|------|--------|-----|
| Claude (40-issue audit) | 40 | 7 P0 | 14 P1 | 14 P2 | 6 P3 |
| Kimi (stress test) | 23 questions | 10 blockers | 5 gaps | 8 partial | — |
| **UNIFIED TOTAL** | **63** | **17 critical** | **19 high** | **22 medium** | **6 low** |

---

## CROSS-REFERENCE: KIMI'S 10 BLOCKERS vs CLAUDE'S FINDINGS

| # | Kimi's Blocker | Kimi Score | Claude Found | Claude Severity | Status |
|---|---------------|-----------|-------------|----------------|--------|
| 1 | SQL Engine tells LLM to omit org_id | 0/1 | ✅ YES | P1 | **GAP: Claude rated P1, Kimi rated CRITICAL** |
| 2 | /auth/session missing fields | 0/1 | ✅ YES | P1 | **GAP: allowed_property_ids empty** |
| 3 | E2E tests test dev bypass | 0/1 | ✅ YES | P0 | **ALIGNED: JWT not verified** |
| 4 | No WebSocket session limit | 0/1 | ❌ NO | — | **MISSED by Claude** |
| 5 | Sessions ephemeral, not 24h | 0/1 | ❌ NO | — | **MISSED by Claude** |
| 6 | SSE has zero rate limiting | 0/1 | ❌ NO | — | **MISSED by Claude** |
| 7 | Mid-stream crashes = generic error | 0/1 | ✅ YES | P1 | **ALIGNED: SSE error handling** |
| 8 | Fastify proxy strips auth | 0/1 | ❌ NO | — | **MISSED by Claude** |
| 9 | Zero tests for /chat/stream | 0/1 | ❌ NO | — | **MISSED by Claude** |
| 10 | budgets table not whitelisted | 0/1 | ❌ NO | — | **MISSED by Claude** |

### AUDIT COVERAGE GAP ANALYSIS

| Category | Claude Found | Kimi Found | Combined |
|----------|-------------|------------|----------|
| Auth/Security | ✅ JWT no verify, token no-op | ✅ Dev bypass | **FULL COVERAGE** |
| SQL Engine | ✅ Guard blocks params, budgets conflict | ✅ LLM prompt omit | **FULL COVERAGE** |
| SSE Streaming | ✅ Parser bugs, no retry | ✅ Generic errors, no rate limit | **PARTIAL: Rate limit MISSED** |
| WebSocket | ✅ Reconnect bugs, stale cleanup | ✅ No session limit, ephemeral | **PARTIAL: Claude missed session limit** |
| Rate Limiting | ✅ Silent bypass on import error | ✅ SSE endpoint none | **PARTIAL: Claude missed SSE** |
| Testing | ❌ | ✅ Zero coverage, dev bypass | **KIMI FOUND WHAT CLAUDE MISSED** |
| Fastify Proxy | ❌ | ✅ Strips auth headers | **KIMI FOUND WHAT CLAUDE MISSED** |

---

## UNIFICATION: 17 CRITICAL ISSUES (Combined)

### PRIORITY 0 — MUST FIX BEFORE PRODUCTION (17 issues)

#### GROUP A: Auth & Security (5 issues)

| ID | Issue | File | Fix Effort | Kimi? | Claude? |
|----|-------|------|------------|-------|---------|
| C0-01 | JWT signature NOT verified | `identity.py`, `cassandra.ts` | 2h | ❌ | ✅ P0 |
| C0-02 | Token validation is no-op | `sql_guard.py:224` | 2h | ❌ | ✅ P0 |
| C0-03 | E2E tests test dev bypass, not real JWT | `e2e-security.test.ts` | 2h | ✅ | ❌ |
| C0-04 | SQL Guard blocks parameterized queries | `sql_guard.py:273-279` | 4h | ❌ | ✅ P0 |
| C0-05 | budgets table not in whitelist, but queries generated | `sql_guard.py`, `reasoning.py` | 1h | ✅ | ❌ |

#### GROUP B: SSE & Streaming (4 issues)

| ID | Issue | File | Fix Effort | Kimi? | Claude? |
|----|-------|------|------------|-------|---------|
| C0-06 | SSEParser resets event type before all lines | `chat.ts:65-74` | 2h | ❌ | ✅ P0 |
| C0-07 | SSE endpoint has ZERO rate limiting | `api_server.py` | 3h | ✅ | ❌ |
| C0-08 | Mid-stream crashes = generic error | `api_server.py` | 2h | ✅ | ✅ P1 |
| C0-09 | Fastify proxy strips Authorization header | `cassandra.ts` | 1h | ✅ | ❌ |

#### GROUP C: WebSocket & Sessions (4 issues)

| ID | Issue | File | Fix Effort | Kimi? | Claude? |
|----|-------|------|------------|-------|---------|
| C0-10 | No WebSocket session limit | `api_server.py` | 2h | ✅ | ❌ |
| C0-11 | Sessions ephemeral, not 24h persistent | `api_server.py` | 4h | ✅ | ❌ |
| C0-12 | turn_count never incremented | `master_loop.py` | 1h | ❌ | ✅ P0 |
| C0-13 | voice_enroll tool not instantiated | `master_loop.py` | 1h | ❌ | ✅ P0 |

#### GROUP D: Data & Context (3 issues)

| ID | Issue | File | Fix Effort | Kimi? | Claude? |
|----|-------|------|------------|-------|---------|
| C0-14 | allowed_property_ids always `[]` | `chat.ts:211-216` | 2h | ✅ | ✅ P1 |
| C0-15 | conversation_history always `[]` | `chat.ts:205` | 1h | ❌ | ✅ P3 |
| C0-16 | /auth/session missing required fields | `auth.ts` | 3h | ✅ | ❌ |

#### GROUP E: Testing & Verification (1 issue)

| ID | Issue | File | Fix Effort | Kimi? | Claude? |
|----|-------|------|------------|-------|---------|
| C0-17 | Zero tests for /chat/stream | `server/src/tests/` | 4h | ✅ | ❌ |

---

## THE "20-LINE LOOP" REALITY

### The Claim
> "A 20-line Python P→A→O→S master loop"

### The Reality
```
$ wc -l cassandra/orchestrator/master_loop.py
823 lines
```

### What's Bloated

| Section | Lines | Problem |
|---------|-------|---------|
| Type definitions | ~100 | Over-engineered dataclasses for every concept |
| Agent loading | ~30 | Lazy loading with no dependency injection |
| Tool registry | ~30 | Manual if/elif for each tool |
| run_stream() | ~340 | 9 stages, each with verbose logging |
| Validation loop | ~80 | 3-iteration loop with manual self-correction |
| Response building | ~60 | Manual dict construction for SSE |
| Helper methods | ~150 | 6 helper methods doing simple work |
| **Actual loop logic** | **~20** | `for chunk in run_stream(): yield chunk` |

### Root Cause: "Future-Proofing Gone Wrong"

```python
# Every piece of infrastructure has a dataclass
@dataclass class StreamChunk: ...
@dataclass class ToolCall: ...
@dataclass class ToolResult: ...
@dataclass class OrchestratorContext: ...  # 20 fields
@dataclass class OrchestratorConfig: ...   # 8 fields
@dataclass class OrchestratorResult: ...  # 15 fields
@dataclass class LoopStage: ...           # 10 enum values
```

**Result:** Reading the actual orchestration logic requires scrolling through 800+ lines.

---

## REFACTORING PLAN: TRUE 20-LINE LOOP

### Target Architecture

```
master_loop.py (TARGET: ~200 lines, down from 823)
├── Types (minimal, ~50 lines)
│   └── StreamChunk, ToolCall, ToolResult only
├── Agent Protocol (~20 lines)
│   └── Protocol + Tool interface
├── Agents (~100 lines total, 7 agents)
│   ├── intent.py (~15 lines each)
│   ├── context.py (~15 lines each)
│   └── ... (compressed)
├── Harness (~30 lines)
│   └── execute_tool() + timeout guard
├── Master Loop (~50 lines)
│   └── 7-agent pipeline + validation
└── Streaming (~30 lines)
    └── Generator wrapper
```

### Key Refactoring Decisions

1. **Collapse 9 stages → 7 stages**
   - Remove `SYNTHESIS` stage (it's just the end state)
   - Merge `PERCEPTION` into stage 1
   - Result: PERCEPTION→INTENT→CONTEXT→PERMISSION→RETRIEVAL→REASONING→VALIDATION→RESPONSE

2. **Compress agent implementations**
   - Each agent should be ~15-20 lines
   - Use composition over inheritance
   - Remove verbose logging in agents

3. **Inline simple helpers**
   - `_result_to_dict()` → 5 lines, inline
   - `_resolve_property_id()` → 3 lines, inline
   - `_self_correct()` → 5 lines, keep separate
   - `_build_halt_result()` → 8 lines, inline into yield
   - `_build_permission_denied_result()` → 8 lines, inline

4. **Remove dataclass bloat**
   - `OrchestratorConfig` → simple dict
   - `OrchestratorContext` → shared state dict
   - `OrchestratorResult` → yield from run_stream()

5. **Add circuit breakers**
   - Tool execution timeout (configurable, default 30s)
   - turn_count increment (THE BUG WE FOUND)
   - Session memory limit

### Before/After Comparison

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Total lines | 823 | ~200 | 76% |
| Dataclasses | 7 | 2 | 71% |
| Helper methods | 6 | 1 | 83% |
| Stages | 9 | 7 | 22% |
| Lines per agent | ~50 | ~15 | 70% |

---

## CONSOLIDATED FIX ROADMAP

### Week 1: Critical Security (Group A)

| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 1 | Fix JWT signature verification | `identity.py`, `cassandra.ts` | Test with forged JWT → rejected |
| 1 | Implement real token validation | `sql_guard.py` | Test with expired token → rejected |
| 2 | Fix SQL Guard parameterized query check | `sql_guard.py` | Test `$1` query → not blocked |
| 2 | Add budgets to whitelist OR remove queries | `sql_guard.py`, `reasoning.py` | Test budget query → succeeds |
| 3 | Add E2E test with real JWT verification | `e2e-security.test.ts` | CI passes with NODE_ENV=production |

### Week 2: Streaming Infrastructure (Group B)

| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 1 | Fix SSEParser event type handling | `chat.ts` | Chunk boundary test → event preserved |
| 1 | Add rate limiting to SSE endpoint | `api_server.py` | Load test → 429 after limit |
| 2 | Add try/except to stream generator | `api_server.py` | Crash mid-stream → structured error |
| 2 | Forward Authorization header in proxy | `cassandra.ts` | Test → Python receives auth |
| 3 | Add retry logic to streamChat | `chat.ts` | Network drop → auto-retry |

### Week 3: Session Management (Group C)

| Day | Task | Files | Verification |
|---------|------|-------|--------------|
| 1 | Add WebSocket session limit (100 cap) | `api_server.py` | 101st connection → rejected |
| 1 | Implement session TTL (24h in Redis) | `api_server.py` | Process restart → session survives |
| 2 | Fix turn_count increment | `master_loop.py` | Add test: 21 turns → stops |
| 2 | Instantiate voice_enroll tool | `master_loop.py` | Test voice_enroll → works |

### Week 4: Data & Context (Group D)

| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 1 | Pass allowed_property_ids from membership | `chat.ts`, `auth.ts` | Single property → auto-resolve |
| 1 | Pass conversation_history to orchestrator | `chat.ts` | Multi-turn → context preserved |
| 2 | Update /auth/session response | `auth.ts` | Response → includes all fields |
| 3 | Test full context hydration | E2E | Property → auto-resolve |

### Week 5: Testing (Group E)

| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 1 | Write SSE event sequence tests | `test_chat_stream.py` | 10 tests for event types |
| 2 | Test validation loop (3 iterations) | `test_validation.py` | Fail at iteration 3 → fallback |
| 3 | Test session limits and TTL | `test_sessions.py` | 101st → rejected, TTL → expires |
| 4 | E2E with production JWT | `e2e-security.test.ts` | All tests pass real auth |

### Week 6: Master Loop Refactor

| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 1 | Extract agent interfaces | `agents/*.py` | All agents implement Protocol |
| 1 | Compress each agent to ~15 lines | `agents/*.py` | Line count verification |
| 2 | Inline helpers into run_stream | `master_loop.py` | Maintain behavior |
| 3 | Add circuit breakers (timeout, turns) | `master_loop.py` | Test: hang → timeout |
| 4 | Full regression testing | All | 40→200 lines, same behavior |

---

## PREVENTIVE MEASURES

### 1. Code Complexity Budget
```
MAX_LINES_PER_FILE: 200
MAX_COMPLEXITY: 10 (cyclomatic)
MAX_DATACLASS_FIELDS: 10
```

### 2. Audit Checklist (Before Every PR)
- [ ] Security: JWT verified? SQL injection prevented?
- [ ] Rate limiting: SSE endpoint covered?
- [ ] Error handling: Structured errors vs generic?
- [ ] Testing: /chat/stream tests written?
- [ ] Auth forwarding: Proxy passes headers?
- [ ] Session: Limits + TTL implemented?

### 3. First-Principles Question Template
For every new feature:
1. **Security:** Can this be exploited?
2. **Resilience:** What fails? How?
3. **Scope:** Is this in the PRD?
4. **Testing:** Is it tested?
5. **Complexity:** Is there a simpler way?

---

## APPENDIX: FILES SUMMARY

| File | Current Lines | Target Lines | Issues |
|------|-------------|-------------|--------|
| `master_loop.py` | 823 | 200 | C0-12, C0-13, bloat |
| `identity.py` | ~208 | ~208 | C0-01 |
| `sql_guard.py` | ~301 | ~301 | C0-02, C0-04 |
| `api_server.py` | ~799 | ~799 | C0-07, C0-08, C0-10, C0-11 |
| `chat.ts` | ~227 | ~227 | C0-06, C0-14, C0-15 |
| `cassandra.ts` (plugin) | ~430 | ~430 | C0-09 |
| `auth.ts` | ~157 | ~157 | C0-16 |
| `e2e-security.test.ts` | ~200 | ~200 | C0-03 |

---

*Unified by: Claude Code Pre-Mortem Protocol + Kimi Stress Test*
*Date: 2026-05-30*
*Next: Begin Week 1 fixes — JWT verification + SQL Guard*
