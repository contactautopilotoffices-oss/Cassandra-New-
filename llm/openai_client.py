"""
OpenAI LLM Client — Single Command Center
=========================================

GPT-4o as the orchestrator with function calling.
Handles: intent classification, tool delegation, answer synthesis.

Module: NEW — Single LLM Core
Status: ACTIVE
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("cassandra.llm")

# ---------------------------------------------------------------------------
# Conversation memory window
# ---------------------------------------------------------------------------
# 16 user/assistant PAIRS = 32 messages. Single source of truth — every place
# that slices conversation history must use this so memory depth is consistent
# end-to-end (orchestrator pass-through AND the LLM message builder).
MAX_HISTORY_PAIRS = 16
MAX_HISTORY_MESSAGES = MAX_HISTORY_PAIRS * 2  # = 32


# ---------------------------------------------------------------------------
# Live schema rendering
# ---------------------------------------------------------------------------
# The LLM's schema knowledge is rendered from cassandra.tools.fms_schema.TABLES —
# the SAME synced source the SQL guard validates against. This kills the old
# stagnation where the prompt held a frozen snapshot that drifted from the live DB.
# fms_schema.py is regenerated from database.types.ts at server startup, so this
# block is always current. Cached per-process (schema is fixed after startup).
_SCHEMA_BLOCK_CACHE: Optional[str] = None


def build_schema_block() -> str:
    """Render live DB schema as 'table: col1, col2, ...' lines from the synced TABLES."""
    global _SCHEMA_BLOCK_CACHE
    if _SCHEMA_BLOCK_CACHE is not None:
        return _SCHEMA_BLOCK_CACHE
    try:
        from cassandra.tools.fms_schema import TABLES
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(f"[SCHEMA] Could not load live schema: {exc}")
        return ""
    lines = []
    for name in sorted(TABLES.keys()):
        cols = TABLES[name].get("columns", [])
        if cols:
            lines.append(f"{name}: {', '.join(cols)}")
    _SCHEMA_BLOCK_CACHE = "\n".join(lines)
    logger.info(f"[SCHEMA] Rendered live schema block: {len(lines)} tables")
    return _SCHEMA_BLOCK_CACHE


# ---------------------------------------------------------------------------
# Tool Definitions (GPT-4o Function Calling)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "classify_ticket",
            "description": (
                "Classify a maintenance ticket to determine the appropriate priority level "
                "(critical/urgent/high/medium/low) and suggest a category. Call this BEFORE "
                "create_ticket to ensure correct priority assignment. Returns: priority, "
                "priority_reason, suggested_category, category_id."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Ticket title/issue description",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of the issue (optional)",
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_ticket",
            "description": (
                "Create a maintenance ticket in the Facility Management System (FMS). "
                "Use this when the user wants to report an issue, request maintenance, "
                "or log a problem. Returns the created ticket with ID and photo_before_url."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Brief title for the ticket (max 100 chars)",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of the issue",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent", "critical"],
                        "description": "Ticket priority (default: medium)",
                    },
                    "property_id": {
                        "type": "string",
                        "description": "UUID of the property (required)",
                    },
                    "category": {
                        "type": "string",
                        "description": "Category UUID (optional)",
                    },
                    "is_internal": {
                        "type": "boolean",
                        "description": "Internal ticket (visible to staff only, default: false)",
                    },
                    "photo_url": {
                        "type": "string",
                        "description": "URL of attached photo (from mobile upload)",
                    },
                },
                "required": ["title", "property_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_tickets",
            "description": (
                "Query tickets from the FMS. Use for listing, searching, or "
                "filtering maintenance tickets. Can filter by property, status, "
                "priority, or assignee."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {
                        "type": "string",
                        "description": "Filter by property UUID",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "assigned", "in_progress", "resolved", "closed", "waitlist"],
                        "description": "Filter by ticket status. 'open'=new tickets, 'assigned'=assigned to staff, 'in_progress'=work started, 'resolved'=completed, 'closed'=archived, 'waitlist'=queued",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent", "critical"],
                        "description": "Filter by priority",
                    },
                    "limit": {
                        "type": "integer",
                        "default": 20,
                        "description": "Max tickets to return (default: 20)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_context",
            "description": (
                "Fetch user/organization context from FMS. Returns membership data, "
                "property assignments, and role information. Call this first to "
                "understand the user's scope."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "include_properties": {
                        "type": "boolean",
                        "default": True,
                        "description": "Include property assignments",
                    },
                    "include_role": {
                        "type": "boolean",
                        "default": True,
                        "description": "Include role and permissions",
                    },
                },
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sql_query",
            "description": (
                "Execute a SQL query against the FMS PostgreSQL database. "
                "ALWAYS include organization_id in WHERE clause. "
                "Use parameterized queries ($1, $2) for safety. "
                "Never query password_hash, api_key, or token columns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "SQL SELECT query (INSERT/UPDATE/DELETE not supported)",
                    },
                    "params": {
                        "type": "object",
                        "description": "Named parameter values for the query",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "health_score",
            "description": (
                "Compute a property or organization HEALTH SCORE from real ticket data. "
                "Use this for ANY question about property health, how well a property is doing, "
                "a 1-10 rating, or comparing properties. Returns resolution rate, SLA breaches, "
                "critical-open count, and a reproducible rating. Computed deterministically in "
                "Python — never fabricate these numbers yourself, always call this tool."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {
                        "type": "string",
                        "description": "UUID of the property to score. Omit for org-wide. For 'compare across properties', call once per property_id.",
                    },
                    "window_days": {
                        "type": "integer",
                        "description": "Look-back window in days (default 30).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "enroll_voice",
            "description": (
                "Enroll a user's voice for voice commands. Collects a 10-second "
                "audio sample and creates a voice profile for the user."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string", "description": "User UUID"},
                    "sample_text": {
                        "type": "string",
                        "description": "Expected phrase for voice sample",
                    },
                },
                "required": ["user_id", "sample_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_date",
            "description": (
                "Calculate a future or past date deterministically. "
                "ALWAYS use this instead of guessing when the user asks relative date questions like "
                "'10 days ago', 'next month', 'in 3 weeks', 'due in 45 days', etc. "
                "Handles leap years, month-end rollover, and timezone correctly."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reference_date": {
                        "type": "string",
                        "description": "Reference date in ISO format (e.g. '2026-06-01' or '2026-06-01T10:00:00'). Defaults to today if omitted.",
                    },
                    "offset_days": {
                        "type": "integer",
                        "description": "Number of days to add (positive) or subtract (negative).",
                    },
                    "offset_weeks": {
                        "type": "integer",
                        "description": "Number of weeks to add (positive) or subtract (negative).",
                    },
                    "offset_months": {
                        "type": "integer",
                        "description": "Number of months to add (positive) or subtract (negative).",
                    },
                    "offset_years": {
                        "type": "integer",
                        "description": "Number of years to add (positive) or subtract (negative).",
                    },
                },
                "required": [],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Cassandra, an AI assistant for a Facility Management System (FMS).

YOUR ROLE:
- Help users manage maintenance tickets, property information, staff lookups, and reports
- Always be helpful, concise, and action-oriented
- When users want to create tickets, query data, or get reports — make it happen

────────────────────────────────────────────────────────────────────────────────
EVERY TURN FOLLOWS THIS LOOP: PERCEIVE → ACT → OBSERVE → RESPOND
────────────────────────────────────────────────────────────────────────────────

─── PHASE: PERCEIVE ───────────────────────────────────────────────────────────
UNDERSTAND THE USER BEFORE ACTING (mandatory, every turn):
Before selecting any tool, silently work out four things. This is the single most important
step — most wrong answers come from acting before understanding.
1. INTENT: What does the user actually want? (count / list / create / compare / explain /
   rate / status-check / follow-up clarification). Pick ONE primary intent.
2. ENTITIES: Extract every concrete entity in the message — property names, dates and
   date ranges, statuses, priorities, people/roles, categories, numbers.
3. SCOPE: Which property or properties? If a property NAME is mentioned, resolve it via
   properties_in_org. If none is mentioned, use the session property_id. If the user says
   "all properties" / "across properties", go org-wide.
4. REFERENCE RESOLUTION: Is this a follow-up? Words like "it", "that one", "the second one",
   "what about <X>", "and last month?" refer to the PREVIOUS turn. Use conversation memory
   to fill in the missing subject — never re-ask for something already established.
If intent or scope is genuinely ambiguous (and memory does not resolve it), ask ONE short
clarifying question instead of guessing. Otherwise proceed — do not over-ask.

CHAIN-OF-THOUGHT: wrap each thinking step in <reasoning> tags (2–5 word labels only).
Valid: <reasoning>Resolving property</reasoning> / <reasoning>Querying tickets</reasoning>
NEVER write prose outside <reasoning> before calling a tool.

─── PHASE: ACT ────────────────────────────────────────────────────────────────
ROLE-AWARE INTERPRETATION (the same words mean different things by role — see 'role' in context):
- A maintenance/field-staff role (e.g. 'mst'): "my tickets" = tickets ASSIGNED to them
  (assigned_to = user_id). "Am I checked in?" → shift_logs. "My score/leaderboard" →
  mst_daily_scores / mst_workload.
- An admin role ('org_super_admin'): org-wide view. "my properties" = all properties in the org.
- 'master_admin': cross-org; still always scope each query by the resolved organization_id.
- Any other / unknown role: treat "my tickets" as tickets they raised (raised_by = user_id)
  and show only their own data.
Read the 'role' field in context and interpret "my/mine/I" accordingly. If the role string
is unfamiliar, prefer the safest narrow scope (raised_by = user_id) over a broad one.

CRITICAL RULES:
1. TENANT SCOPE: You MUST know the user's organization_id before taking any action.
   The org_id is provided in the context. NEVER query data without org_id.
2. PHOTO SUPPORT: If the user attaches a photo, use the photo_url in ticket creation.
3. PROPERTY CONTEXT: Always confirm the property before creating tickets.
4. TICKET LIFECYCLE — REAL STATUS VALUES (use ONLY these exact strings):
   - 'open'          → newly raised, not yet assigned
   - 'assigned'      → assigned to staff, work not started
   - 'in_progress'   → work actively in progress
   - 'resolved'      → work done, pending close
   - 'closed'        → fully closed and archived
   - 'waitlist'      → queued, awaiting assignment
   When users say "open tickets" query for status IN ('open','assigned','in_progress').
   NEVER use: 'pending_validation', 'satisfied', 'paused' — these do not exist.
5. PRIORITY LEVELS (real values): 'low', 'medium', 'high', 'urgent', 'critical' (default: 'medium')

DATABASE SCHEMA:
The full live database schema — every table with its exact column names — is provided
in the context message below under "LIVE DATABASE SCHEMA". It is generated from the
current database at server startup, so it is always current. Use ONLY the tables and
columns listed there. If a column you expect is not in that list, do NOT invent it —
use the closest real column or tell the user that data isn't tracked.

DATE HANDLING RULES:
- The current date and time is provided in the context below. Use it as the source of truth to resolve "today", "tomorrow", "yesterday", "next week", etc.
- Always use ISO format in database queries: created_at >= '2026-05-31T00:00:00' AND created_at < '2026-06-01T00:00:00'
- Use the current_datetime provided in the context below as the source of truth for "today", "tomorrow", "yesterday", etc.

CONVERSATION STYLE:
- Keep answers concise (3-5 sentences max for simple queries)
- Use bullet points for lists
- For ticket creation: confirm briefly and show the ticket ID. NEVER output markdown headers (###) or bold labels (**Title:**) — the mobile UI shows plain text only.
- NEVER use markdown formatting like ###, **bold**, or bullet points with dashes in the middle of sentences. Use simple plain text only.
- For queries: show relevant data in a clean format
- ALWAYS show reasoning for complex requests (see above)

FUNCTION CALLING — EXACT RULES:

1. COUNT questions ("how many tickets...") → ALWAYS use sql_query with COUNT(*):
   Example: SELECT COUNT(*) FROM tickets WHERE organization_id = '<org_id>' AND status IN ('assigned','waitlist','pending_validation')
   NEVER call query_tickets for a count question — it only returns 20 rows.

2. "show/list tickets" → use query_tickets with the correct status filter
   - For open tickets: you CANNOT pass multiple statuses to query_tickets.
     Instead use sql_query: SELECT * FROM tickets WHERE organization_id='<org_id>' AND status IN ('assigned','waitlist','pending_validation') LIMIT 20

3. "create/report/raise a ticket" → classify_ticket THEN create_ticket
   - When the user describes a problem (e.g. "leakage in cafeteria"), FIRST call classify_ticket to detect priority and category.
   - Use the classification results to set priority and category in create_ticket.
   - AI CLASSIFICATION RULES:
     * Fire, smoke, gas leak, medical emergency → priority: critical
     * Water leak, flooding, no power, ac not working, elevator stuck → priority: urgent
     * Security concerns, repeated issues → priority: high
     * Minor cosmetic issues → priority: low
     * Everything else → priority: medium (default)
   - Example flow: "water leak in bathroom" → classify_ticket → returns priority=urgent → create_ticket with priority="urgent"
   - Do NOT hardcode priority. ALWAYS classify first.

4. "aggregation / group by / who has most..." → sql_query with GROUP BY

5. "my properties/org/role" → fetch_context

PROPERTY NAME RESOLUTION (CRITICAL):
The context above contains a "properties_in_org" list mapping every property name to its UUID.
When a user mentions a property by name (e.g. "ETPL", "SS Plaza", "Indore", "Bajaj Kolkata"):
1. Find the matching property in properties_in_org (case-insensitive, partial match OK).
2. Use that property's UUID in the WHERE clause: AND property_id = '<uuid>'
3. NEVER fall back to org-wide queries when the user has specified a property name.
4. If the name matches multiple properties, list them and ask the user to clarify.
5. If the user challenges your answer, re-run with corrected scope and acknowledge.

HEALTH SCORE CALCULATION:
When asked for a "health score", "property health", or similar metric, ALWAYS call the
health_score tool. NEVER compute it with sql_query and NEVER fabricate a number.
- Single property named → call health_score with that property_id.
- "Compare health across properties" → call health_score once per property_id, then rank.

FK JOIN RULES — FOREIGN KEY RELATIONSHIPS:
CRITICAL: Always use the correct FK columns for JOINs. NEVER invent relationships.
The FK graph provides verified relationships. Use EXACTLY these for JOINs:

| From Table | To Table | FK Column | Notes |
|------------|----------|-----------|-------|
| tickets | properties | tickets.property_id = properties.id | Get property name for tickets |
| tickets | users | tickets.raised_by = users.id | Get ticket creator |
| tickets | users | tickets.assigned_to = users.id | Get assigned staff |
| tickets | issue_categories | tickets.category_id = issue_categories.id | Get category name |
| electricity_readings | properties | electricity_readings.property_id = properties.id | Get property name for readings |
| mst_workload | users | mst_workload.user_id = users.id | Get MST name |
| resolver_stats | users | resolver_stats.user_id = users.id | Get resolver name |

NEVER use these WRONG column names:
- ❌ tickets.created_by → use tickets.raised_by
- ❌ users.avatar → use users.user_photo_url
- ❌ tickets.category → use tickets.category_id (UUID, not text)

If you need to get data from two tables (e.g., tickets with property names):
1. First query the primary table (tickets)
2. Then query the related table (properties) if needed
3. The system will JOIN them in Python — you don't need to write SQL JOINs

─── PHASE: OBSERVE ────────────────────────────────────────────────────────────
OBSERVE TOOL RESULTS — before responding, read the data critically:
After every tool call, evaluate the result:
  • Data returned → proceed to RESPOND with real numbers.
  • 0 rows / empty list → DO NOT say "no data" immediately. Diagnose first:
      - Was the date range too narrow? → retry without date filter or expand to 90 days
      - Was a property filter applied? → retry org-wide
      - Was a status filter too strict? → retry without status filter
  • Tool error → log it and try a different approach (different tool, different query).

RETRY RULE: When the first query returns 0 rows, adjust scope and call the tool AGAIN
(once). Only after the retry returns empty should you respond with alternatives.
Format: "I searched [X] for [Y] and found no results. Try: (1) ... (2) ... (3) ..."
NEVER say "I don't have that information" — that phrase is banned entirely.

─── PHASE: RESPOND ────────────────────────────────────────────────────────────
RESPONSE QUALITY:
- If query returns 0 rows after retry: "No results found for [scope]. Try: (1) Last 90 days
  (2) Different property (3) Remove status filter." — be specific to what was searched.
- NEVER respond with "I don't have that information" or "I can't find that" — EVER.
- Org-wide → call health_score with no property_id.
The tool returns: health_score (%), resolved_closed, total, sla_breached, critical_open.
Present as: "Health: 78.5% — 47 of 60 tickets resolved in the last 30 days (2 SLA breaches)."
Do NOT write SQL with FILTER, NULLIF, NOW(), or CURRENT_DATE arithmetic — the SQL tool
cannot evaluate those; it will return wrong numbers. Use health_score instead.

OPINION / RATING QUESTIONS:
When a user asks a subjective question ("rate this property 1–10", "is this a good building",
"how well is SS Plaza doing"):
- DO NOT say "I don't have that information."
- Call the health_score tool to get real numbers, then answer.
- The tool returns rating_out_of_10 — use it directly; do not invent your own rating.
- Always show your working: "Based on your data: 47/60 tickets resolved (78%), 2 SLA
  breaches, 1 critical open → 7.8/10."
Never give a rating without first calling health_score to get the real numbers.

SELF-CORRECTION:
When the user says anything like "that's wrong", "I don't think that's right", "double-check",
"are you sure", "that seems off", "verify this", "I see X not Y":
1. Immediately acknowledge: "Let me re-check that."
2. Re-run the exact query (use conversation history to reconstruct what was queried).
3. Return the corrected result with: "After re-checking: [result]. I had the scope wrong earlier."
NEVER defend an earlier answer — always re-verify when challenged.

NEVER GUESS — call a tool before answering any factual question.
NEVER pass $1/$2 params — inline the actual org_id value directly in the query string.
Example: WHERE organization_id = '211e1330-ad83-446d-941f-dcea48396798'

RESPONSE FORMAT:
- Markdown supported for formatting
- Emoji OK for visual cues (🎫 for tickets, 👤 for people, 📊 for data)
- NEVER expose raw SQL, UUIDs, or internal system terms to the user
- NEVER make up ticket numbers, property names, or dates — verify first
- NEVER say "I don't have that information" — call a tool instead.
"""


# ---------------------------------------------------------------------------
# LLM Result
# ---------------------------------------------------------------------------

@dataclass
class LLMResult:
    """Result from a single LLM orchestrator pass."""
    answer: str
    tool_calls: list[dict[str, Any]]
    citations: list[dict]
    confidence: float
    finish_reason: str  # "stop" | "tool_calls" | "length"
    usage: dict[str, int]  # prompt_tokens, completion_tokens, total_tokens


# ---------------------------------------------------------------------------
# OpenAI Client
# ---------------------------------------------------------------------------

class OpenAIClient:
    """
    OpenAI GPT-4o client wrapper for the LLM orchestrator.

    Uses the modern OpenAI SDK with:
    - Function calling for tool use
    - Streaming for SSE output
    - Configurable model and temperature
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize OpenAI client.

        Args:
            api_key: OpenAI API key. Defaults to OPENAI_API_KEY env var.
        """
        import openai

        self._api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        if not self._api_key:
            raise ValueError(
                "OPENAI_API_KEY not set. "
                "Set it via environment variable or pass api_key."
            )

        self._client = openai.OpenAI(api_key=self._api_key)
        # Default to GPT-4o-mini (from env, with proper fallback)
        self._model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self._temperature = float(os.environ.get("OPENAI_TEMPERATURE", "0.7"))
        self._max_tokens = int(os.environ.get("OPENAI_MAX_TOKENS", "2048"))
        # Extended thinking budget (0-150000 tokens)
        self._thinking_budget = int(os.environ.get("OPENAI_THINKING_BUDGET", "10000"))
        self._enable_thinking = os.environ.get("OPENAI_ENABLE_THINKING", "true").lower() == "true"
        self._logger = logging.getLogger("cassandra.llm.openai")

        self._logger.info(
            f"OpenAI client initialized: model={self._model}, "
            f"temperature={self._temperature}, "
            f"thinking={'enabled' if self._enable_thinking else 'disabled'}"
        )

    @property
    def client(self) -> Any:
        """Return the underlying OpenAI client."""
        return self._client

    @property
    def model(self) -> str:
        """Return the model name."""
        return self._model

    def chat(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict[str, Any]]] = None,
        stream: bool = False,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        enable_thinking: Optional[bool] = None,
        tool_choice: Optional[Any] = None,
    ) -> Any:
        """
        Send a chat completion request to OpenAI.

        Args:
            messages: List of message dicts with 'role' and 'content'
            tools: List of OpenAI tool definitions (function calling)
            stream: Whether to stream the response
            temperature: Sampling temperature (0.0-2.0)
            max_tokens: Max tokens in response
            enable_thinking: Enable extended thinking (CoT)
            tool_choice: Override tool choice ('auto', 'none', or dict to force a function)

        Returns:
            OpenAI ChatCompletion response (or streaming iterator)
        """
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature or self._temperature,
            "max_tokens": max_tokens or self._max_tokens,
        }

        # Extended thinking is only available on o1, o3 and future models
        # gpt-4o-mini uses system prompt for CoT instead
        # if enable_thinking or (enable_thinking is None and self._enable_thinking):
        #     kwargs["reasoning_effort"] = "medium"  # Only works with o1/o3

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = tool_choice if tool_choice is not None else "auto"

        if stream:
            return self._client.chat.completions.create(**kwargs)
        else:
            return self._client.chat.completions.create(**kwargs)

    def chat_with_tools(
        self,
        messages: list[dict[str, str]],
        context: dict[str, Any],
        history: Optional[list[dict[str, str]]] = None,
    ) -> LLMResult:
        """
        Run a single chat turn with function calling and extended thinking.

        Args:
            messages: Current conversation messages
            context: OrchestratorContext with org_id, user_id, role, etc.
            history: Optional conversation history (last N messages)

        Returns:
            LLMResult with answer, tool_calls, citations, confidence, thinking
        """
        # Build full message list
        full_messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        import datetime
        from zoneinfo import ZoneInfo
        ist = ZoneInfo("Asia/Kolkata")
        now_ist = datetime.datetime.now(ist)
        current_time = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        is_midnight = now_ist.hour < 2
        midnight_note = "\nNOTE: It is currently just past midnight in India. If the user says 'today' or 'yesterday', ask which specific date they mean before querying.\n" if is_midnight else ""

        # Inject context as system info
        context_info = (
            f"Current user context:\n"
            f"- current_datetime: {current_time}{midnight_note}\n"
            f"- organization_id: {context.get('org_id', 'UNKNOWN')}\n"
            f"- user_id: {context.get('user_id', 'UNKNOWN')}\n"
            f"- role: {context.get('role', 'tenant')}\n"
            f"- property_id (session default): {context.get('property_id', 'UNKNOWN')}\n"
        )

        # Build human-readable property list for name resolution
        property_metadata = context.get("property_metadata") or {}
        if property_metadata:
            prop_lines = []
            for pid, meta in property_metadata.items():
                name = meta.get("name", "")
                code = meta.get("code", "")
                city = meta.get("city", "")
                label = name
                if code and code != name:
                    label += f" (code: {code})"
                if city:
                    label += f", {city}"
                prop_lines.append(f"  • {label} → id: {pid}")
            context_info += "- properties_in_org (use these to resolve property names to IDs):\n"
            context_info += "\n".join(prop_lines) + "\n"
        else:
            context_info += f"- allowed_property_ids: {context.get('allowed_property_ids', [])}\n"

        if context.get("photo_url"):
            context_info += f"- photo_url: {context['photo_url']}\n"
        full_messages.append({"role": "system", "content": context_info})

        # Inject the LIVE database schema (rendered from the synced fms_schema.TABLES,
        # the same source the SQL guard uses). Always current — never a frozen snapshot.
        schema_block = build_schema_block()
        if schema_block:
            full_messages.append({
                "role": "system",
                "content": (
                    "LIVE DATABASE SCHEMA (exact table and column names — use ONLY these):\n"
                    + schema_block
                ),
            })

        # Add conversation memory (last 16 pairs = 32 messages)
        if history:
            for h in history[-MAX_HISTORY_MESSAGES:]:
                role = "assistant" if h.get("role") == "cassandra" else "user"
                full_messages.append({
                    "role": role,
                    "content": h.get("content", ""),
                })

        # Add current message
        full_messages.extend(messages)

        # Force create_ticket tool when user explicitly asks to raise a ticket
        user_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user").lower()
        force_tool = None
        if any(k in user_text for k in ("raise a ticket", "create a ticket", "report an issue", "log a problem", "file a complaint")):
            force_tool = {"type": "function", "function": {"name": "create_ticket"}}

        # Call OpenAI (gpt-4o-mini uses system prompt for reasoning)
        start = time.time()
        response = self.chat(
            messages=full_messages,
            tools=TOOL_DEFINITIONS,
            stream=False,
            enable_thinking=False,
            tool_choice=force_tool,
        )
        elapsed_ms = (time.time() - start) * 1000

        # Parse response
        choice = response.choices[0]
        finish_reason = choice.finish_reason or "stop"
        usage = {
            "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
            "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            "total_tokens": response.usage.total_tokens if response.usage else 0,
        }

        self._logger.info(
            f"[LLM] {finish_reason} | "
            f"tokens={usage['total_tokens']} | "
            f"latency={elapsed_ms:.0f}ms"
        )

        # Extract thinking block if present
        thinking_text = ""
        if hasattr(choice.message, "thinking") and choice.message.thinking:
            thinking_text = choice.message.thinking

        # Extract tool calls
        tool_calls: list[dict[str, Any]] = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": json.loads(tc.function.arguments),
                })

        # Build answer
        answer = choice.message.content or ""

        # Calculate confidence (based on finish reason and tool usage)
        confidence = 0.5
        if finish_reason == "stop":
            confidence = 0.9
        elif finish_reason == "tool_calls":
            confidence = 0.85  # High confidence when tool is being used

        result = LLMResult(
            answer=answer,
            tool_calls=tool_calls,
            citations=[],  # Citations added by tool execution results
            confidence=confidence,
            finish_reason=finish_reason,
            usage=usage,
        )
        # Store thinking in the result for streaming
        result.thinking = thinking_text  # type: ignore
        return result

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        context: dict[str, Any],
        history: Optional[list[dict[str, str]]] = None,
    ):
        """
        Stream a chat completion response with extended thinking.

        Yields:
            dict with type: 'thinking', 'content', 'tool_call', 'done'
        """
        # Build full message list (same as chat_with_tools)
        full_messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        import datetime
        from zoneinfo import ZoneInfo
        ist = ZoneInfo("Asia/Kolkata")
        now_ist = datetime.datetime.now(ist)
        current_time = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        is_midnight = now_ist.hour < 2
        midnight_note = "\nNOTE: It is currently just past midnight in India. If the user says 'today' or 'yesterday', ask which specific date they mean before querying.\n" if is_midnight else ""

        context_info = (
            f"Current user context:\n"
            f"- current_datetime: {current_time}{midnight_note}\n"
            f"- organization_id: {context.get('org_id', 'UNKNOWN')}\n"
            f"- user_id: {context.get('user_id', 'UNKNOWN')}\n"
            f"- role: {context.get('role', 'tenant')}\n"
            f"- property_id (session default): {context.get('property_id', 'UNKNOWN')}\n"
        )
        property_metadata = context.get("property_metadata") or {}
        if property_metadata:
            prop_lines = []
            for pid, meta in property_metadata.items():
                name = meta.get("name", "")
                code = meta.get("code", "")
                city = meta.get("city", "")
                label = name
                if code and code != name:
                    label += f" (code: {code})"
                if city:
                    label += f", {city}"
                prop_lines.append(f"  • {label} → id: {pid}")
            context_info += "- properties_in_org (use these to resolve property names to IDs):\n"
            context_info += "\n".join(prop_lines) + "\n"
        else:
            context_info += f"- allowed_property_ids: {context.get('allowed_property_ids', [])}\n"
        if context.get("photo_url"):
            context_info += f"- photo_url: {context['photo_url']}\n"
        full_messages.append({"role": "system", "content": context_info})

        # Inject the LIVE database schema (rendered from the synced fms_schema.TABLES,
        # the same source the SQL guard uses). Always current — never a frozen snapshot.
        schema_block = build_schema_block()
        if schema_block:
            full_messages.append({
                "role": "system",
                "content": (
                    "LIVE DATABASE SCHEMA (exact table and column names — use ONLY these):\n"
                    + schema_block
                ),
            })

        if history:
            for h in history[-MAX_HISTORY_MESSAGES:]:
                role = "assistant" if h.get("role") == "cassandra" else "user"
                full_messages.append({
                    "role": role,
                    "content": h.get("content", ""),
                })

        full_messages.extend(messages)

        # Force create_ticket tool when user explicitly asks to raise a ticket
        user_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user").lower()
        force_tool = None
        if any(k in user_text for k in ("raise a ticket", "create a ticket", "report an issue", "log a problem", "file a complaint")):
            force_tool = {"type": "function", "function": {"name": "create_ticket"}}

        # Stream the response (thinking will be implicit per system prompt)
        stream = self._client.chat.completions.create(
            model=self._model,
            messages=full_messages,
            tools=TOOL_DEFINITIONS,
            tool_choice=force_tool if force_tool is not None else "auto",
            temperature=self._temperature,
            max_tokens=self._max_tokens,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta:
                delta = chunk.choices[0].delta
                # Stream thinking blocks
                if hasattr(delta, "thinking") and delta.thinking:
                    yield {"type": "thinking", "thinking": delta.thinking}
                # Stream text content
                if delta.content:
                    yield {"type": "content", "content": delta.content}
                # Stream tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        yield {
                            "type": "tool_call",
                            "id": tc.id,
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "",
                        }
                # Stream finish event
                if chunk.choices[0].finish_reason:
                    yield {
                        "type": "done",
                        "finish_reason": chunk.choices[0].finish_reason,
                    }
