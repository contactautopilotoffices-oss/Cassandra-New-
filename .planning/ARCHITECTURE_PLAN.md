# Architecture Plan: Single LLM Core with Query Queue
> Generated: 2026-05-31
> Status: READY FOR APPROVAL

---

## Executive Summary

The current Cassandra orchestrator is a **rule-based monolith** (7 deterministic if/elif agents). This plan replaces it with:

1. **Single LLM Core**: One GPT-4o instance acts as the "command center"
2. **Delegation Model**: LLM decides when to delegate to specialized sub-agents (which get updated system prompts)
3. **Query Queue**: Background worker prevents LLM burnout from continuous queries
4. **SSE Notifications**: Users get real-time progress via Server-Sent Events

---

## Phase 1: Delete Universe B (Rule-Based Monolith)

### Files to DELETE
```
cassandra/agents/intent.py          # Rule-based keyword classifier → DELETE
cassandra/agents/context.py         # Rule-based context agent → DELETE
cassandra/agents/permission.py       # Rule-based permission check → DELETE
cassandra/agents/retrieval.py       # Rule-based retrieval → DELETE
cassandra/agents/reasoning.py      # Rule-based reasoning → DELETE
cassandra/agents/validation.py       # Rule-based validation → DELETE
cassandra/agents/response.py         # Rule-based response formatter → DELETE
cassandra/agents/__init__.py        # Package init → DELETE
cassandra/harness/role_gate.py      # Rule-based role gate → DELETE
cassandra/harness/__init__.py       # Package init → DELETE
```

### Files to REBUILD (with updated system prompts)
```
cassandra/tools/sql_engine.py        # KEEP but update SYSTEM_PROMPT
cassandra/tools/create_ticket.py     # KEEP as-is (already works)
cassandra/tools/fetch_context.py    # KEEP but update system prompt
cassandra/tools/voice_enroll.py     # KEEP (already has OpenAI integration)
cassandra/tools/rate_limiter.py     # KEEP (already works)
cassandra/tools/supermemory_client.py  # KEEP (already has API key pattern)
```

---

## Phase 2: Build Single LLM Core

### New File: `cassandra/llm/openai_client.py`

```python
"""
OpenAI LLM Client — Single Command Center
=======================================

GPT-4o as the orchestrator. Uses:
- Tool definitions for function calling
- System prompt for FMS domain knowledge
- Streaming for SSE output
"""

from openai import OpenAI
from typing import Any, Optional
import os

class OpenAIClient:
    def __init__(self):
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        self.client = OpenAI(api_key=api_key)
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    def chat(
        self,
        messages: list[dict],
        tools: list[dict],  # OpenAI tool definitions
        stream: bool = False,
    ) -> Any:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools,
            stream=stream,
            tool_choice="auto",
        )
        return response
```

### New File: `cassandra/orchestrator/llm_orchestrator.py`

```python
"""
LLM Orchestrator — Single Command Center
========================================

One GPT-4o instance orchestrates everything:
1. Classifies intent (no separate Intent Agent)
2. Decides which tools to call
3. Synthesizes the final answer
4. Can delegate to sub-agents via tool calls

The 7 agents become TOOLS, not separate code paths.
"""

class LLMOrchestrator:
    def __init__(self, client: OpenAIClient):
        self.client = client

    def run(self, message: str, context: OrchestratorContext) -> OrchestratorResult:
        # Build system prompt
        system_msg = self._build_system_prompt(context)

        # Build messages
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": message},
        ]

        # Add conversation history
        for h in context.conversation_history[-10:]:
            role = "assistant" if h["role"] == "cassandra" else "user"
            messages.append({"role": role, "content": h["content"]})

        # Get tool definitions
        tools = self._get_tool_definitions()

        # Call LLM
        response = self.client.chat(messages=messages, tools=tools)

        # Handle response (tool calls or direct answer)
        return self._process_response(response, context, messages, tools)
```

### Tool Definitions (GPT-4o Function Calling)

```python
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "query_tickets",
            "description": "Query tickets from FMS. Use for listing, searching tickets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "string"},
                    "status": {"type": "string", "enum": ["open", "in_progress", "resolved", "closed"]},
                    "priority": {"type": "string"},
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_ticket",
            "description": "Create a maintenance ticket in the FMS.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                    "property_id": {"type": "string"},
                    "photo_url": {"type": "string"},  # C0-16: photo support
                },
                "required": ["title", "property_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_context",
            "description": "Get user/org context from FMS.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "sql_query",
            "description": "Execute SQL query against FMS database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "params": {"type": "object"}
                },
                "required": ["query"]
            }
        }
    }
]
```

---

## Phase 3: Query Queue (Background Worker)

### New File: `cassandra/queue/query_queue.py`

```python
"""
Query Queue — Background Worker for LLM Load Management
=====================================================

Problem: Continuous queries burn through LLM tokens and increase hallucination risk.
Solution: Queue queries, process async, notify via SSE.

Flow:
1. POST /chat → Returns 202 Accepted + job_id
2. Job queued in background worker
3. Worker processes job, stores result
4. Client polls SSE or Webhook for result
"""

import threading
import queue
import uuid
import time
from dataclasses import dataclass, field
from typing import Callable, Any

@dataclass
class QueuedJob:
    job_id: str
    message: str
    context: dict
    created_at: float
    status: str = "queued"  # queued | processing | done | failed
    result: Any = None
    error: str | None = None

class QueryQueue:
    def __init__(self, max_size: int = 1000):
        self._queue: queue.Queue = queue.Queue(maxsize=max_size)
        self._jobs: dict[str, QueuedJob] = {}
        self._worker_thread: threading.Thread | None = None
        self._running = False
        self._handler: Callable | None = None

    def enqueue(self, message: str, context: dict) -> str:
        job_id = str(uuid.uuid4())
        job = QueuedJob(
            job_id=job_id,
            message=message,
            context=context,
            created_at=time.time(),
        )
        self._jobs[job_id] = job
        self._queue.put(job)
        return job_id

    def get_job(self, job_id: str) -> QueuedJob | None:
        return self._jobs.get(job_id)

    def start_worker(self, handler: Callable[[QueuedJob], None]):
        """Start background worker that processes queued jobs."""
        self._handler = handler
        self._running = True
        self._worker_thread = threading.Thread(target=self._run, daemon=True)
        self._worker_thread.start()

    def stop_worker(self):
        self._running = False
        if self._worker_thread:
            self._worker_thread.join(timeout=5)

    def _run(self):
        while self._running:
            try:
                job = self._queue.get(timeout=1)
                job.status = "processing"
                try:
                    result = self._handler(job)
                    job.result = result
                    job.status = "done"
                except Exception as e:
                    job.error = str(e)
                    job.status = "failed"
                self._queue.task_done()
            except queue.Empty:
                continue
```

### Queue Processing Strategy

```
User Query → Queue → 202 Accepted (job_id)
                         ↓
                   SSE: "queued" status
                         ↓
              Background Worker picks up job
                         ↓
              SSE: "processing" + step updates
                         ↓
              LLM Orchestrator processes
                         ↓
              SSE: "done" + final answer
```

**Why this reduces hallucination:**
- LLM processes ONE query at a time per worker
- Queue smooths burst traffic
- Previous context not constantly re-sent (only last 10 messages)
- Rate limiting built into queue

---

## Phase 4: Update API Server

### New Endpoint: `POST /chat/stream` (Queue Mode)

```python
@app.post("/chat/stream")
async def chat_stream(request: StreamChatRequest):
    """
    Queue-mode streaming: Fast 202 response, SSE for updates.
    """
    # Validate request
    if not request.context.get("org_id"):
        return StreamingResponse(
            iter([error_payload]),
            media_type="text/event-stream",
            status_code=400,
        )

    # Enqueue job
    job_id = query_queue.enqueue(
        message=request.message,
        context={
            "org_id": request.context["org_id"],
            "user_id": request.context["user_id"],
            "role": request.context.get("role", "tenant"),
            "photo_url": request.photo_url,  # C0-16
            "conversation_history": request.conversation_history,
        }
    )

    # Return 202 + job_id
    return {
        "status": "queued",
        "job_id": job_id,
    }
```

### SSE Endpoint: `GET /chat/stream/{job_id}`

```python
@app.get("/chat/stream/{job_id}")
async def stream_job_status(job_id: str):
    """
    SSE endpoint for job status updates.
    """
    async def event_generator():
        while True:
            job = query_queue.get_job(job_id)
            if not job:
                yield f"event: error\ndata: {{'message': 'Job not found'}}\n\n"
                break

            if job.status == "done":
                yield f"event: done\ndata: {{'response': {json.dumps(job.result)} }}\n\n"
                break
            elif job.status == "failed":
                yield f"event: error\ndata: {{'message': '{job.error}'}}\n\n"
                break
            else:
                yield f"event: status\ndata: {{'status': '{job.status}'}}\n\n"

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )
```

---

## Phase 5: Updated System Prompt for Sub-Agents

### `cassandra/tools/sql_engine.py` — Updated System Prompt

```python
SQL_GEN_SYSTEM_PROMPT = """
You are a SQL generation engine for a Facility Management System (FMS).

CRITICAL RULES:
1. ALWAYS include organization_id = '<org_id>' in WHERE clause
2. Use parameterized queries only (use $1, $2 for Postgres)
3. NEVER query: password_hash, api_key, token, secret
4. Tables: tickets, properties, users, organization_memberships, stock_items
5. Column names are snake_case (photo_before_url, raised_by, etc.)
"""
```

### `cassandra/tools/create_ticket.py` — Keep as-is
Already correctly persists tickets and handles C0-11/C0-12/C0-16.

---

## Phase 6: Mobile Integration

### Update `saas_mobile_app/services/cassandra/chat.ts`

The mobile already sends to `/cassandra/chat/stream`. Two changes:

1. **Handle 202 Accepted**: If response is 202, poll SSE endpoint
2. **Handle SSE events**: `queued`, `processing`, `done`, `error`

```typescript
// In streamChat(), after sending request:
xhr.onreadystatechange = () => {
  if (xhr.readyState === 4) {
    if (xhr.status === 202) {
      // Job queued — start polling SSE
      const { job_id } = JSON.parse(xhr.responseText);
      startPollingSSE(job_id);
    } else if (xhr.status === 200) {
      // Direct response (fallback)
      processResponse(xhr.responseText);
    }
  }
};
```

---

## Implementation Order

### Sprint 1: Foundation (Day 1)
1. Delete all 7 rule-based agents
2. Create `cassandra/llm/openai_client.py`
3. Create `cassandra/orchestrator/llm_orchestrator.py`
4. Update `requirements.txt` with `openai>=1.0.0`

### Sprint 2: Queue (Day 2)
5. Create `cassandra/queue/query_queue.py`
6. Update `api_server.py` with queue endpoints
7. Update `master_loop.py` to use LLM orchestrator

### Sprint 3: Mobile + QA (Day 3)
8. Update mobile `chat.ts` for 202 handling
9. Test end-to-end: attach photo → create ticket
10. Verify SSE notifications work

---

## Files to CREATE

| File | Purpose |
|------|---------|
| `cassandra/llm/__init__.py` | Package init |
| `cassandra/llm/openai_client.py` | OpenAI GPT-4o client wrapper |
| `cassandra/queue/__init__.py` | Package init |
| `cassandra/queue/query_queue.py` | Background job queue |

## Files to DELETE

| File | Reason |
|------|--------|
| `cassandra/agents/intent.py` | Replaced by LLM classification |
| `cassandra/agents/context.py` | Replaced by LLM context |
| `cassandra/agents/permission.py` | Replaced by LLM authorization |
| `cassandra/agents/retrieval.py` | Replaced by LLM retrieval |
| `cassandra/agents/reasoning.py` | Replaced by LLM reasoning |
| `cassandra/agents/validation.py` | Replaced by LLM validation |
| `cassandra/agents/response.py` | Replaced by LLM response |
| `cassandra/agents/__init__.py` | Package init |
| `cassandra/harness/role_gate.py` | Replaced by LLM authorization |
| `cassandra/harness/__init__.py` | Package init |
| `cassandra/orchestrator/master_loop.py` | REPLACED by `llm_orchestrator.py` |

## Files to MODIFY

| File | Change |
|------|--------|
| `cassandra/orchestrator/api_server.py` | Add queue endpoints, remove 7-agent wiring |
| `cassandra/tools/sql_engine.py` | Update SYSTEM_PROMPT for GPT-4o |
| `cassandra/tools/create_ticket.py` | Keep as-is (C0-11/C0-12/C0-16 already working) |
| `cassandra/tools/fetch_context.py` | Update system prompt |
| `cassandra/requirements.txt` | Add `openai>=1.0.0` |
| `saas_mobile_app/services/cassandra/chat.ts` | Handle 202 + SSE polling |
| `ACTIVE_PRD.md` | Document new architecture |

---

## Success Criteria

1. **Single LLM Core**: One GPT-4o instance processes all queries
2. **No Rule-Based Agents**: All 7 rule-based files deleted
3. **Queue Working**: Queries queued, processed async, SSE notifies
4. **Photo Still Works**: C0-11/C0-12/C0-16 regressions prevented
5. **Mobile Unchanged**: `streamChat()` works with 202 responses

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| OpenAI API down | Return 503 with retry-after header |
| LLM hallucination | Strict system prompt + tool definitions |
| Queue overflow | Max queue size 1000, oldest jobs dropped |
| Mobile breaking change | 202 response is backward-compatible fallback |
