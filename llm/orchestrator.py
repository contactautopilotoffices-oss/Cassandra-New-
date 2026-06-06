"""
LLM Orchestrator — Single Command Center
=======================================

One GPT-4o instance orchestrates everything:
1. Classifies intent (via system prompt)
2. Decides which tools to call
3. Executes tools and synthesizes results
4. Returns the final answer

NO separate agents. NO rule-based branching.
The LLM decides, the harness executes.

Module: NEW — Single LLM Core
Status: ACTIVE
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from cassandra.llm.openai_client import (
    OpenAIClient,
    LLMResult,
    SYSTEM_PROMPT,
    TOOL_DEFINITIONS,
    MAX_HISTORY_MESSAGES,
)
from cassandra.orchestrator import ToolResult  # Shared type
from cassandra.tools.calculate_date import CalculateDateTool
from cassandra.tools.classify_ticket import ClassifyTicketTool
from cassandra.tools.create_ticket import CreateTicketTool
from cassandra.tools.fetch_context import FetchContextTool
from cassandra.tools.health_score import HealthScoreTool
from cassandra.tools.query_tickets import QueryTicketsTool
from cassandra.tools.sql_engine_v2 import SQLEngineV2Tool  # v2: FK-aware JOINs
from cassandra.tools.voice_enroll import VoiceEnrollTool

logger = logging.getLogger("cassandra.llm.orchestrator")

TOOL_RESULT_TRUNCATION_CHARS = 6000


# ---------------------------------------------------------------------------
# Stream Chunk
# ---------------------------------------------------------------------------

@dataclass
class StreamChunk:
    """SSE stream chunk."""
    event: str
    data: dict


# ---------------------------------------------------------------------------
# LLM Orchestrator
# ---------------------------------------------------------------------------

class LLMOrchestrator:
    """
    Single LLM Command Center.

    Uses GPT-4o to:
    - Understand the user's intent
    - Decide which tools to call
    - Execute tools via the harness
    - Synthesize the final answer

    No rule-based branching. No separate agents.
    The LLM is the orchestrator.
    """

    MAX_TOOL_CALLS = 10
    TOOL_TIMEOUT_S = 30

    def __init__(self, llm_client: Optional[OpenAIClient] = None):
        """
        Initialize the orchestrator.

        Args:
            llm_client: OpenAI client. If None, reads from OPENAI_API_KEY env.
        """
        if llm_client:
            self._llm = llm_client
        else:
            self._llm = OpenAIClient()

        # Initialize tools
        self._tools: dict[str, Any] = {
            "calculate_date": CalculateDateTool(),
            "classify_ticket": ClassifyTicketTool(),  # AI priority/category detection
            "create_ticket": CreateTicketTool(),
            "fetch_context": FetchContextTool(),
            "health_score": HealthScoreTool(),
            "query_tickets": QueryTicketsTool(),
            "sql_query": SQLEngineV2Tool(),  # v2: FK-aware JOINs, Python-side merge
            "enroll_voice": VoiceEnrollTool(),
        }

        self._logger = logging.getLogger("cassandra.llm.orchestrator")
        self._logger.info("LLM Orchestrator initialized with tools: " + ", ".join(self._tools.keys()))

    def _build_context(self, org_id: str, user_id: str, property_id: str, role: str, **kwargs) -> dict:
        """Build the context dict for the LLM."""
        ctx = {
            "org_id": org_id,
            "user_id": user_id,
            "property_id": property_id,  # Added 2026-06-01
            "role": role,
            "allowed_property_ids": kwargs.get("allowed_property_ids", []),
        }
        if kwargs.get("photo_url"):
            ctx["photo_url"] = kwargs["photo_url"]
        if kwargs.get("property_metadata"):
            ctx["property_metadata"] = kwargs["property_metadata"]
        return ctx

    def _execute_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        context: dict[str, Any],
    ) -> ToolResult:
        """Execute a single tool with timeout."""
        if name not in self._tools:
            return ToolResult(
                call_id=f"unknown_tool_{time.time():.0f}",
                tool_name=name,
                success=False,
                error=f"UNKNOWN_TOOL: '{name}' not found",
            )

        tool = self._tools[name]
        start = time.time()

        # Build mock OrchestratorContext for tools
        mock_ctx = type("MockContext", (), {
            "org_id": context.get("org_id", ""),
            "user_id": context.get("user_id", ""),
            "property_id": context.get("property_id", ""),  # Added 2026-06-01
            "role": context.get("role", "tenant"),
            "allowed_property_ids": context.get("allowed_property_ids", []),
            "property_metadata": context.get("property_metadata", {}),
            "photo_url": context.get("photo_url"),
            "turn_count": 0,
            "conversation_history": [],
            "tool_results": [],
            "current_stage": "ACTION",
            "max_turns": 20,
            "max_validation_iterations": 3,
            "current_timestamp": datetime.now(timezone.utc).isoformat(),
        })()

        try:
            result = tool.execute(arguments, mock_ctx)
            elapsed_ms = (time.time() - start) * 1000
            return ToolResult(
                call_id=getattr(result, 'call_id', f"exec_{time.time():.0f}"),
                tool_name=name,
                success=result.success,
                result=result.result,
                error=result.error,
                execution_ms=elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = (time.time() - start) * 1000
            self._logger.error(f"[TOOL] {name} raised: {exc}")
            return ToolResult(
                call_id=f"tool_error_{time.time():.0f}",
                tool_name=name,
                success=False,
                error=f"TOOL_RAISED: {type(exc).__name__}: {exc}",
                execution_ms=elapsed_ms,
            )

    def _generate_clarification(
        self,
        message: str,
        tool_results: list[ToolResult],
        context: dict,
    ) -> Optional[str]:
        """
        Generate clarification when query returns empty/inconclusive results.

        Instead of saying "I don't have information", offer helpful alternatives.
        """
        # Check if any result is empty or failed
        has_data = False
        has_error = False
        entities = []

        for tr in tool_results:
            if tr.success:
                data = tr.result
                if data and (isinstance(data, list) and len(data) > 0 or isinstance(data, dict) and data):
                    has_data = True
            if tr.error:
                has_error = True

        # If we have data, no clarification needed
        if has_data:
            return None

        # Extract entities from the query for helpful suggestions
        import re
        words = re.findall(r'\b\w+\b', message.lower())
        entity_keywords = {
            'electricity': 'electricity_readings',
            'energy': 'electricity_readings',
            'power': 'electricity_readings',
            'ticket': 'tickets',
            'issue': 'tickets',
            'complaint': 'tickets',
            'mst': 'mst_workload',
            'staff': 'users',
            'property': 'properties',
            'building': 'properties',
        }
        for word in words:
            if word in entity_keywords and entity_keywords[word] not in entities:
                entities.append(entity_keywords[word])

        # Build clarification message
        alternatives = []

        # Use context for better suggestions
        current_property = context.get("property_id", "")
        if current_property:
            alternatives.insert(0, f"You're viewing property ID: {current_property[:8]}... — try selecting a different property")

        # Suggest time range expansion
        alternatives.append("Try a different time range (e.g., last 30 days instead of this month)")

        # Suggest property search
        if 'properties' not in entities:
            alternatives.append("Check a different property or use a partial name search")

        # Suggest checking data exists
        if entities:
            alternatives.append(f"Verify data exists in {', '.join(set(entities))} table")

        # Specific suggestions based on error type
        if has_error:
            alternatives.insert(0, "There was an error accessing the data. Let me know if you'd like to rephrase.")

        if not alternatives:
            return None

        response = "I found no results for your query. Here's what you can try:\n\n"
        response += "\n".join(f"{i+1}. {alt}" for i, alt in enumerate(alternatives))
        response += "\n\nWould you like me to help with any of these?"

        return response

    def _check_query_ambiguity(self, message: str, context: dict) -> Optional[str]:
        """
        Detect combination queries that need clarification before execution.

        Returns a clarification question if ambiguity detected, None otherwise.
        """
        import re
        msg_lower = message.lower()

        clarifications = []

        # 1. Check if property name is ambiguous (multiple matches possible)
        property_meta = context.get("property_metadata", {})
        if isinstance(property_meta, dict) and len(property_meta) > 1:
            # Check if message mentions a partial property name
            for prop_name in property_meta.keys():
                if prop_name.lower() in msg_lower and len(prop_name) > 3:
                    clarifications.append(
                        f"I found multiple properties. Did you mean '{prop_name}'?"
                    )
                    break

        # 2. Check for time range ambiguity
        time_keywords = ['yesterday', 'last week', 'last month', 'this month', 'recently']
        has_time = any(kw in msg_lower for kw in time_keywords)
        has_specific_date = bool(re.search(r'\d{4}-\d{2}-\d{2}', message))

        if has_time and not has_specific_date:
            clarifications.append(
                "Would you like me to clarify the time range (e.g., last 7 days, last 30 days, specific dates)?"
            )

        # 3. Check for aggregation scope ambiguity
        agg_keywords = ['compare', 'all', 'across', 'total', 'sum', 'average']
        has_agg = any(kw in msg_lower for kw in agg_keywords)
        has_property_specific = context.get("property_id") and len(str(context.get("property_id", ""))) > 10

        if has_agg and has_property_specific:
            clarifications.append(
                "I see you want to aggregate across properties. Should I include all properties or specific ones?"
            )

        # 4. Check for missing critical context
        entity_keywords = {
            'electricity': 'electricity_readings',
            'energy': 'electricity_readings',
            'ticket': 'tickets',
            'mst': 'mst_workload',
            'staff': 'users',
        }
        detected_entities = []
        for kw, entity in entity_keywords.items():
            if kw in msg_lower:
                detected_entities.append(entity)

        # If multiple entities detected, might need scope clarification
        if len(set(detected_entities)) > 1:
            clarifications.append(
                f"I see you're asking about {', '.join(set(detected_entities))}. Should I query all or filter by property?"
            )

        # Return first clarification (one at a time)
        if clarifications:
            return clarifications[0]

        return None

    def _format_tool_results(self, tool_results: list[ToolResult]) -> str:
        """Format tool results for the LLM to synthesize."""
        lines = ["## Tool Execution Results\n"]
        for tr in tool_results:
            status = "✅" if tr.success else "❌"
            tool_name = getattr(tr, 'tool_name', getattr(tr, 'name', 'unknown'))
            lines.append(f"### {status} {tool_name} ({tr.execution_ms:.0f}ms)\n")
            if tr.success and tr.result:
                # Format result as clean JSON
                try:
                    result_json = json.dumps(tr.result, indent=2, default=str)
                    # Truncate long results
                    if len(result_json) > TOOL_RESULT_TRUNCATION_CHARS:
                        result_json = (
                            result_json[:TOOL_RESULT_TRUNCATION_CHARS]
                            + f"\n... (truncated at {TOOL_RESULT_TRUNCATION_CHARS} chars)"
                        )
                    lines.append(f"```json\n{result_json}\n```\n")
                except Exception:
                    lines.append(f"{tr.result}\n")
            if tr.error:
                lines.append(f"**Error:** {tr.error}\n")
        return "\n".join(lines)

    def _summarize_retry_context(
        self,
        initial_tool_calls: list[dict[str, Any]],
        initial_results: list[ToolResult],
        retry_tool_calls: list[dict[str, Any]],
        retry_results: list[ToolResult],
    ) -> str:
        """Describe what changed during O→A retry so synthesis stays grounded."""
        def _tool_list(calls: list[dict[str, Any]]) -> str:
            if not calls:
                return "none"
            return ", ".join(tc.get("name", "unknown") for tc in calls)

        def _query_preview(calls: list[dict[str, Any]]) -> str:
            previews = []
            for tc in calls:
                args = tc.get("arguments", {})
                if "query" in args:
                    query = str(args["query"]).strip().replace("\n", " ")
                    previews.append(query[:180])
            return " | ".join(previews[:2]) if previews else "n/a"

        def _result_summary(results: list[ToolResult]) -> str:
            parts = []
            for tr in results:
                tool_name = getattr(tr, "tool_name", getattr(tr, "name", "unknown"))
                if tr.success:
                    if isinstance(tr.result, list):
                        parts.append(f"{tool_name}: {len(tr.result)} row(s)")
                    elif isinstance(tr.result, dict):
                        parts.append(f"{tool_name}: 1 object")
                    else:
                        parts.append(f"{tool_name}: success")
                else:
                    parts.append(f"{tool_name}: error={tr.error}")
            return "; ".join(parts) if parts else "none"

        return (
            "O→A retry summary:\n"
            f"- Initial tools: {_tool_list(initial_tool_calls)}\n"
            f"- Initial results: {_result_summary(initial_results)}\n"
            f"- Retry tools: {_tool_list(retry_tool_calls)}\n"
            f"- Retry query preview: {_query_preview(retry_tool_calls)}\n"
            f"- Retry results: {_result_summary(retry_results)}\n"
            "- Use the latest successful grounded result. If scope broadened, state that plainly."
        )

    def _build_synthesis_messages(
        self,
        message: str,
        first_answer: str,
        tool_results_text: str,
        retry_context_text: str = "",
    ) -> list[dict[str, str]]:
        """Build a single synthesis prompt used by both streaming and non-streaming flows."""
        import re

        reasoning_blocks = re.findall(r"<reasoning>(.*?)</reasoning>", first_answer or "", re.DOTALL)
        chain_of_thought = "\n".join(
            f"<reasoning>{rb.strip()}</reasoning>" for rb in reasoning_blocks if rb.strip()
        )
        retry_block = f"{retry_context_text}\n\n" if retry_context_text else ""

        return [
            {"role": "user", "content": message},
            {
                "role": "assistant",
                "content": "I'll use tools to help answer this. Let me execute the necessary actions.",
            },
            {
                "role": "user",
                "content": (
                    f"Reasoning steps so far:\n{chain_of_thought or '[none]'}\n\n"
                    f"{retry_block}"
                    f"Tool results:\n{tool_results_text}\n\n"
                    f"Original question: {message}\n\n"
                    "Write the final answer. Rules:\n"
                    "1. Wrap any reasoning in <reasoning> tags.\n"
                    "2. Answer the question directly and completely using only grounded results.\n"
                    "3. If a retry changed scope, say so explicitly and briefly.\n"
                    "4. For counts: give the total and any supported breakdown.\n"
                    "5. For lists: show the most important rows first.\n"
                    "6. For ticket creation: state the ticket ID and priority clearly.\n"
                    "7. If tools failed or stayed inconclusive, say exactly what failed instead of guessing.\n"
                    "8. Plain text only — no markdown headers, no bold, no UUIDs visible to user.\n"
                    "9. Never mention 'tool', 'function', or internal system terms."
                ),
            },
        ]

    def _sanitize_answer(self, answer: str) -> str:
        """Strip any leaked internal terms from the answer."""
        import re

        # Patterns that should never reach the user
        leak_patterns = [
            (r"(?i)\bHARNESS\b|\bMASTER_LOOP\b|\bTOOL_RAISED\b", ""),
            (r"(?i)\bSQL_GUARD\b", ""),
            (r"(?i)\bSELF-CORRECT\b.*?attempt \d/3", ""),
            (r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "[id]"),
            (r"(?i)\bSELECT\b.*?\bFROM\b.*?\bWHERE\b", "[database query]"),
            # Strip markdown formatting that looks bad in plain-text UI
            (r"#{1,6}\s*", ""),                    # ### headers
            (r"\*\*([^*]+)\*\*", r"\1"),             # **bold** → plain
            (r"\*([^*]+)\*", r"\1"),                 # *italic* → plain
            (r"`{1,3}([^`]+)`{1,3}", r"\1"),         # `code` → plain
        ]

        cleaned = answer
        for pattern, replacement in leak_patterns:
            cleaned = re.sub(pattern, replacement, cleaned)

        # Collapse multiple whitespace
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        cleaned = re.sub(r" {2,}", " ", cleaned)
        return cleaned.strip()

    def run(
        self,
        message: str,
        org_id: str,
        user_id: str,
        property_id: str = "",
        role: str = "tenant",
        photo_url: Optional[str] = None,
        conversation_history: Optional[list[dict]] = None,
        allowed_property_ids: Optional[list[str]] = None,
        property_metadata: Optional[dict] = None,
        on_progress: Optional[Any] = None,
    ) -> dict:
        """
        Run the LLM orchestrator (non-streaming).

        Args:
            message: User's message
            org_id: Organization ID
            user_id: User ID
            property_id: Currently selected property ID
            role: User role (tenant, org_admin, etc.)
            photo_url: Photo URL from mobile upload (optional)
            conversation_history: Previous messages
            allowed_property_ids: Property IDs the user can access
            property_metadata: Property name/code mapping
            on_progress: Optional callback(event_type: str, data: dict) for real-time
                         CoT streaming. Called before/after each tool execution so the
                         SSE layer can emit tool_start / tool_result events live.

        Returns:
            dict with answer, tool_results, citations, confidence
        """
        context = self._build_context(
            org_id=org_id,
            user_id=user_id,
            property_id=property_id,  # Added 2026-06-01
            role=role,
            photo_url=photo_url,
            allowed_property_ids=allowed_property_ids or [],
            property_metadata=property_metadata or {},
        )

        # Inject photo_url and allowed_property_ids into the context dict
        # (for tools that access it directly)
        context["photo_url"] = photo_url
        context["allowed_property_ids"] = allowed_property_ids or []

        # Build history for the LLM (16 pairs = 32 messages — see MAX_HISTORY_MESSAGES)
        history = conversation_history[-MAX_HISTORY_MESSAGES:] if conversation_history else []

        # First call: Get LLM response with potential tool calls
        # NOTE: Ambiguity detection is handled by the LLM's PERCEPTION block.
        # No Python-level interception — let the model decide when to ask.
        messages = [{"role": "user", "content": message}]

        self._logger.info(
            f"[ORCH] Processing: org={org_id}, property={property_id[:8] if property_id else 'none'}, role={role}, "
            f"history={len(history)}, photo={'yes' if photo_url else 'no'}"
        )

        # Initial LLM call
        llm_result = self._llm.chat_with_tools(
            messages=messages,
            context=context,
            history=history,
        )

        tool_results: list[ToolResult] = []
        all_tool_calls = llm_result.tool_calls
        retry_context_text = ""

        # Execute tool calls (up to MAX_TOOL_CALLS)
        classify_result: dict[str, Any] | None = None
        pending_create_ticket_args: dict[str, Any] | None = None

        for i, tc in enumerate(all_tool_calls[: self.MAX_TOOL_CALLS]):
            tool_name = tc["name"]
            tool_args = tc.get("arguments", {})

            self._logger.info(f"[ORCH] Tool call {i+1}: {tool_name}({list(tool_args.keys())})")

            # Emit tool_start progress event for real-time CoT streaming
            if on_progress:
                on_progress("tool_start", {"step": i + 1, "tool": tool_name})

            # Handle classify_ticket → create_ticket chaining
            if tool_name == "classify_ticket":
                result = self._execute_tool(tool_name, tool_args, context)
                tool_results.append(result)
                if result.success and result.result:
                    classify_result = result.result
                    # Store create_ticket args for the next iteration
                    pending_create_ticket_args = {
                        "title": tool_args.get("title", ""),
                        "description": tool_args.get("description", ""),
                        "priority": classify_result.get("apply_priority", "medium"),
                        "category": classify_result.get("category_id") or classify_result.get("apply_category", ""),
                        "property_id": context.get("property_id", ""),
                    }
                if on_progress:
                    on_progress("tool_result", {"tool": tool_name, "success": result.success, "execution_ms": result.execution_ms})
                continue  # Skip to next tool call

            if tool_name == "create_ticket":
                # --- Auto-classify if LLM skipped classify_ticket (e.g. force_tool) ---
                if classify_result is None:
                    _title = tool_args.get("title", "")
                    _desc = tool_args.get("description", "")
                    if _title or _desc:
                        auto_cl = self._execute_tool(
                            "classify_ticket",
                            {"title": _title, "description": _desc},
                            context,
                        )
                        if auto_cl.success and auto_cl.result:
                            classify_result = auto_cl.result
                            tool_results.append(auto_cl)
                            self._logger.info(
                                f"[ORCH] Auto-classify: priority={classify_result.get('apply_priority')}"
                            )

                # Merge classified priority/category if available
                if classify_result:
                    auto_priority = classify_result.get("apply_priority", "medium")
                    if not tool_args.get("priority") or tool_args.get("priority") == "medium":
                        tool_args = {**tool_args, "priority": auto_priority}

                # If we had pending_create_ticket_args (explicit classify→create chain), apply them
                if pending_create_ticket_args:
                    tool_args = {**tool_args, **pending_create_ticket_args}
                    tool_args = {k: v for k, v in tool_args.items() if v}
                    self._logger.info(f"[ORCH] Injecting classification: priority={pending_create_ticket_args.get('priority')}")
                    classify_result = None
                    pending_create_ticket_args = None

                # Always ensure property_id comes from context if LLM left it blank
                if not tool_args.get("property_id"):
                    tool_args = {**tool_args, "property_id": context.get("property_id", "")}

                # Inject photo_url if available
                if photo_url:
                    tool_args = {**tool_args, "photo_url": photo_url}

            result = self._execute_tool(tool_name, tool_args, context)
            tool_results.append(result)

            self._logger.info(
                f"[ORCH] Tool result {i+1}: {tool_name} → "
                f"{'✅' if result.success else '❌'} "
                f"({result.execution_ms:.0f}ms)"
            )
            # Emit tool_result progress event for real-time CoT streaming
            if on_progress:
                on_progress("tool_result", {"tool": tool_name, "success": result.success, "execution_ms": result.execution_ms})

        # ── O→A RECOVERY EDGE ──────────────────────────────────────────────────
        # If every tool call returned empty rows, give the LLM ONE retry with an
        # explicit directive to broaden scope (remove date filter, go org-wide, etc.)
        # This is the Observe→Act feedback loop. Max 1 cycle to stay fast.
        # ────────────────────────────────────────────────────────────────────────
        if tool_results:
            def _all_empty(results: list[ToolResult]) -> bool:
                return all(
                    not tr.success or
                    tr.result is None or
                    (isinstance(tr.result, list) and len(tr.result) == 0) or
                    (isinstance(tr.result, dict) and not tr.result)
                    for tr in results
                )

            def _date_filtered_zero(results: list[ToolResult], user_message: str) -> bool:
                """Check if a date-filtered query returned 0 rows — signals wrong date scope."""
                msg_lower = user_message.lower()
                has_date_context = any(kw in msg_lower for kw in [
                    'january', 'february', 'march', 'april', 'may', 'june',
                    'july', 'august', 'september', 'october', 'november', 'december',
                    'last month', 'last week', 'yesterday', 'today',
                    'this month', 'this week', 'this year',
                ])
                if not has_date_context:
                    return False
                return any(
                    tr.success and isinstance(tr.result, list) and len(tr.result) == 0
                    for tr in results
                    if getattr(tr, 'tool_name', getattr(tr, 'name', '')) in ('sql_query',)
                )

            should_retry = _all_empty(tool_results) or _date_filtered_zero(tool_results, message)

            if should_retry:
                if _all_empty(tool_results):
                    self._logger.info("[ORCH] O→A recovery: all tools returned empty — retrying with broadened scope")
                else:
                    self._logger.info("[ORCH] O→A recovery: date-filtered query returned 0 rows — retrying with broader date scope")
                initial_results = list(tool_results)
                retry_messages = [
                    {"role": "user", "content": message},
                    {
                        "role": "assistant",
                        "content": "My previous query returned no results. Let me try with a broader scope.",
                    },
                    {
                        "role": "user",
                        "content": (
                            "The last query returned 0 rows. Retry with adjusted scope:\n"
                            "• If date-filtered → remove date filter or expand to last 90 days\n"
                            "• If property-specific → try org-wide (omit property_id filter)\n"
                            "• If status-filtered → remove or broaden the status filter\n"
                            f"Original question: {message}"
                        ),
                    },
                ]
                retry_llm = self._llm.chat_with_tools(
                    messages=retry_messages,
                    context=context,
                    history=history,
                )
                if retry_llm.tool_calls:
                    retry_results: list[ToolResult] = []
                    for tc in retry_llm.tool_calls[: self.MAX_TOOL_CALLS]:
                        tname = tc["name"]
                        targs = tc.get("arguments", {})
                        if tname == "create_ticket" and photo_url:
                            targs = {**targs, "photo_url": photo_url}
                        retry_results.append(self._execute_tool(tname, targs, context))
                        self._logger.info(f"[ORCH] Retry tool: {tname} → {'✅' if retry_results[-1].success else '❌'}")
                    retry_context_text = self._summarize_retry_context(
                        initial_tool_calls=all_tool_calls[: self.MAX_TOOL_CALLS],
                        initial_results=initial_results,
                        retry_tool_calls=retry_llm.tool_calls[: self.MAX_TOOL_CALLS],
                        retry_results=retry_results,
                    )
                    # Use retry results if they have data, otherwise keep empty for LLM to explain
                    if not _all_empty(retry_results):
                        tool_results = retry_results
                        llm_result = retry_llm
                    else:
                        # Both attempts empty — keep original for synthesis LLM to format nicely
                        tool_results = retry_results

        # If tools were called, do a second LLM call to synthesize results
        if tool_results:
            # Build tool results message
            tool_results_text = self._format_tool_results(tool_results)
            messages = self._build_synthesis_messages(
                message=message,
                first_answer=llm_result.answer or "",
                tool_results_text=tool_results_text,
                retry_context_text=retry_context_text,
            )

            synthesis_result = self._llm.chat_with_tools(
                messages=messages,
                context=context,
                history=history,
                synthesis_mode=True,  # Prevent blank-response bug: force text-only, no tool re-calls
            )

            raw_answer = synthesis_result.answer or ""
            # Guard against silent drop: if synthesis returned empty text, fall back to
            # the original LLM answer (which may have reasoning tags but is better than nothing)
            if not raw_answer.strip():
                self._logger.warning("[ORCH] Synthesis returned empty answer — falling back to llm_result.answer")
                raw_answer = llm_result.answer or "I processed your request but couldn't format a response. Please try again."
            final_answer = self._sanitize_answer(raw_answer)
        else:
            final_answer = self._sanitize_answer(llm_result.answer or "")

        # Embed ticket data in answer for mobile parseToolCall
        final_answer = self._embed_ticket_data(final_answer, tool_results)

        self._logger.info(
            f"[ORCH] Done: answer_length={len(final_answer)}, "
            f"tools_used={[getattr(tr, 'tool_name', getattr(tr, 'name', '?')) for tr in tool_results if tr.success]}"
        )

        return {
            "response": final_answer,
            "tool_results": [
                {
                    "tool_name": getattr(tr, 'tool_name', getattr(tr, 'name', 'unknown')),
                    "success": tr.success,
                    "result": tr.result,
                    "error": tr.error,
                    "execution_ms": tr.execution_ms,
                }
                for tr in tool_results
            ],
            "citations": [],
            "confidence": llm_result.confidence,
            "finish_reason": llm_result.finish_reason,
            "usage": llm_result.usage,
        }

    def _embed_ticket_data(self, answer: str, tool_results: list[ToolResult]) -> str:
        """
        Embed ticket creation data in answer for mobile parseToolCall.

        Mobile CassandraSessionModal.parseToolCall() extracts this to render
        the "Ticket Created" card with photo.
        """
        for tr in tool_results:
            tool_name = getattr(tr, 'tool_name', getattr(tr, 'name', ''))
            if tool_name == "create_ticket" and tr.success:
                result = tr.result or {}
                ticket = result.get("ticket") or {}
                ticket_id = ticket.get("id") or result.get("ticket_id")
                if ticket_id:
                    # Embed as HTML comment for easy extraction
                    photo_url = ticket.get("photo_before_url") or ""
                    return (
                        f"{answer}\n\n"
                        f"<!--TICKET_DATA{{"
                        f'"ticket_id":"{ticket_id}",'
                        f'"status":"{ticket.get("status","open")}",'
                        f'"title":"{self._sanitize_answer(ticket.get("title","") or "")}",'
                        f'"photo_before_url":"{photo_url}"'
                        f'}}TICKET_DATA-->\n'
                    )
        return answer

    def run_stream(
        self,
        message: str,
        org_id: str,
        user_id: str,
        property_id: str = "",
        role: str = "tenant",
        photo_url: Optional[str] = None,
        conversation_history: Optional[list[dict]] = None,
        allowed_property_ids: Optional[list[str]] = None,
        property_metadata: Optional[dict] = None,
    ):
        """
        Run the LLM orchestrator with SSE streaming.

        Yields StreamChunk events for real-time UI updates, including reasoning/CoT.

        Args:
            Same as run()

        Yields:
            StreamChunk events: reasoning, tool_start, tool_result, answer, done
        """
        context = self._build_context(
            org_id=org_id,
            user_id=user_id,
            property_id=property_id,  # Added 2026-06-01
            role=role,
            photo_url=photo_url,
            allowed_property_ids=allowed_property_ids or [],
            property_metadata=property_metadata or {},
        )

        # Inject photo_url and allowed_property_ids into the context dict
        # (for tools that access it directly)
        context["photo_url"] = photo_url
        context["allowed_property_ids"] = allowed_property_ids or []

        history = conversation_history[-MAX_HISTORY_MESSAGES:] if conversation_history else []
        messages = [{"role": "user", "content": message}]

        # Stream the initial LLM call to get reasoning and tool calls
        reasoning_steps = []
        full_response = ""
        in_reasoning_tag = False
        current_reasoning = ""
        tag_buffer = ""  # Buffer for incomplete tags across SSE chunks

        for chunk in self._llm.stream_chat(
            messages=messages,
            context=context,
            history=history,
        ):
            if chunk.get("type") == "content":
                content = chunk.get("content", "")
                full_response += content

                # Prepend any buffered tag fragment from previous chunk
                if tag_buffer:
                    content = tag_buffer + content
                    tag_buffer = ""

                # Parse reasoning tags from streamed content
                i = 0
                while i < len(content):
                    if not in_reasoning_tag:
                        # Look for opening tag
                        if content[i:i+11] == "<reasoning>":
                            in_reasoning_tag = True
                            current_reasoning = ""
                            i += 11
                            continue
                        # Buffer potential partial opening tag at chunk boundary
                        if i >= len(content) - 10:
                            remaining = content[i:]
                            if "<reasoning>"[:len(remaining)] == remaining:
                                tag_buffer = remaining
                                break
                    else:
                        # Look for closing tag
                        if content[i:i+12] == "</reasoning>":
                            if current_reasoning.strip():
                                reasoning_steps.append(current_reasoning.strip())
                                yield StreamChunk("reasoning", {"message": current_reasoning.strip()})
                            in_reasoning_tag = False
                            current_reasoning = ""
                            i += 12
                            continue
                        # Buffer potential partial closing tag at chunk boundary
                        if i >= len(content) - 11:
                            remaining = content[i:]
                            if "</reasoning>"[:len(remaining)] == remaining:
                                tag_buffer = remaining
                                break
                        # Add character to current reasoning
                        current_reasoning += content[i]
                    i += 1

        # Get full result for tool execution
        llm_result = self._llm.chat_with_tools(
            messages=messages,
            context=context,
            history=history,
        )

        tool_results: list[ToolResult] = []
        classify_result: dict[str, Any] | None = None
        pending_create_ticket_args: dict[str, Any] | None = None

        # Execute tool calls with streaming events
        for i, tc in enumerate(llm_result.tool_calls[: self.MAX_TOOL_CALLS]):
            tool_name = tc["name"]
            tool_args = tc.get("arguments", {})

            # Handle classify_ticket → create_ticket chaining
            if tool_name == "classify_ticket":
                yield StreamChunk("tool_start", {
                    "step": i + 1,
                    "tool": tool_name,
                    "message": "Analyzing ticket...",
                })
                result = self._execute_tool(tool_name, tool_args, context)
                tool_results.append(result)
                if result.success and result.result:
                    classify_result = result.result
                    pending_create_ticket_args = {
                        "title": tool_args.get("title", ""),
                        "description": tool_args.get("description", ""),
                        "priority": classify_result.get("apply_priority", "medium"),
                        "category": classify_result.get("category_id") or classify_result.get("apply_category", ""),
                        "property_id": context.get("property_id", ""),
                    }
                yield StreamChunk("tool_result", {
                    "tool": tool_name,
                    "success": result.success,
                    "message": f"Priority: {classify_result.get('priority', 'medium')}" if result.success else "Failed",
                    "execution_ms": result.execution_ms,
                })
                continue

            if tool_name == "create_ticket":
                yield StreamChunk("tool_start", {
                    "step": i + 1,
                    "tool": tool_name,
                    "message": "Creating ticket...",
                })
                # Auto-classify if LLM skipped classify_ticket
                if classify_result is None:
                    _title = tool_args.get("title", "")
                    _desc = tool_args.get("description", "")
                    if _title or _desc:
                        auto_cl = self._execute_tool(
                            "classify_ticket",
                            {"title": _title, "description": _desc},
                            context,
                        )
                        if auto_cl.success and auto_cl.result:
                            classify_result = auto_cl.result
                            tool_results.append(auto_cl)
                            self._logger.info(
                                f"[ORCH] Auto-classify (stream): priority={classify_result.get('apply_priority')}"
                            )

                # Merge classified priority
                if classify_result:
                    auto_priority = classify_result.get("apply_priority", "medium")
                    if not tool_args.get("priority") or tool_args.get("priority") == "medium":
                        tool_args = {**tool_args, "priority": auto_priority}

                # If we had pending_create_ticket_args (explicit chain), apply them
                if pending_create_ticket_args:
                    tool_args = {**tool_args, **pending_create_ticket_args}
                    tool_args = {k: v for k, v in tool_args.items() if v}
                    self._logger.info(f"[ORCH] Injecting classification: priority={pending_create_ticket_args.get('priority')}")
                    classify_result = None
                    pending_create_ticket_args = None

                # Always ensure property_id from context if LLM left it blank
                if not tool_args.get("property_id"):
                    tool_args = {**tool_args, "property_id": context.get("property_id", "")}

                # Inject photo_url
                if photo_url:
                    tool_args = {**tool_args, "photo_url": photo_url}
            else:
                yield StreamChunk("tool_start", {
                    "step": i + 1,
                    "tool": tool_name,
                    "message": f"Running {tool_name}...",
                })

            result = self._execute_tool(tool_name, tool_args, context)
            tool_results.append(result)

            yield StreamChunk("tool_result", {
                "tool": tool_name,
                "success": result.success,
                "message": result.error or "Done",
                "execution_ms": result.execution_ms,
            })

        # Synthesize with second LLM call if tools were used
        if tool_results:
            tool_results_text = self._format_tool_results(tool_results)
            messages = self._build_synthesis_messages(
                message=message,
                first_answer=llm_result.answer or full_response,
                tool_results_text=tool_results_text,
            )

            # Stream synthesis response and accumulate tokens for final answer
            # FIX: Don't call LLM twice — accumulate streamed tokens instead
            synthesized_answer = ""
            for chunk in self._llm.stream_chat(
                messages=messages,
                context=context,
                history=history,
                synthesis_mode=True,
            ):
                if chunk.get("type") == "content":
                    token = chunk.get("content", "")
                    synthesized_answer += token
                    yield StreamChunk("answer", {"text": token})

            raw_answer = synthesized_answer.strip()
            if not raw_answer:
                self._logger.warning("[ORCH] Stream synthesis returned empty answer — falling back to llm_result.answer")
                raw_answer = llm_result.answer or full_response or "I processed your request but couldn't format a response. Please try again."
            final_answer = self._sanitize_answer(raw_answer)
        else:
            final_answer = self._sanitize_answer(llm_result.answer)

        # Embed ticket data
        final_answer = self._embed_ticket_data(final_answer, tool_results)

        yield StreamChunk("done", {
            "response": final_answer,
            "tool_results": [
                {"tool_name": getattr(tr, 'tool_name', getattr(tr, 'name', 'unknown')), "success": tr.success, "result": tr.result}
                for tr in tool_results
            ],
            "citations": [],
            "confidence": llm_result.confidence,
        })
