"""
Cassandra Orchestrator — Lightweight Master Loop
================================================

Optimized for Render deployment:
- ~180 lines (down from 441)
- All 7 agents preserved
- Validation loop (3 iterations)
- Safety limits (max_turns)
- Tool timeout enforced (30s circuit breaker)
- Chain-of-Thought streaming via SSE

Module: 4 (Orchestrator Mount)
"""

from __future__ import annotations

import logging
import signal
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional


class LoopStage(str, Enum):
    PERCEPTION = "perception"
    INTENT = "intent"
    CONTEXT = "context"
    PERMISSION = "permission"
    RETRIEVAL = "retrieval"
    REASONING = "reasoning"
    VALIDATION = "validation"
    RESPONSE = "response"
    ACTION = "action"
    HALTED = "halted"


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    call_id: str
    reasoning: str = ""


@dataclass
class ToolResult:
    call_id: str
    tool_name: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    execution_ms: float = 0.0
    stage_at_execution: LoopStage = LoopStage.ACTION


@dataclass
class OrchestratorContext:
    org_id: str
    user_id: str
    role: str = "tenant"
    conversation_history: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    current_stage: LoopStage = LoopStage.PERCEPTION
    turn_count: int = 0
    max_turns: int = 20
    max_validation_iterations: int = 3
    allowed_property_ids: list[str] = field(default_factory=list)
    property_metadata: dict[str, dict] = field(default_factory=dict)  # id → {name, code}
    current_timestamp: str = ""
    # FIX C0-11: Photo URL from mobile upload
    photo_url: Optional[str] = None


@dataclass
class OrchestratorConfig:
    max_turns: int = 20
    max_validation_iterations: int = 3
    tools: list[dict[str, Any]] = field(default_factory=list)
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    role: str = "tenant"
    trace: bool = True
    # FIX C0-11: Photo URL from mobile upload
    photo_url: Optional[str] = None


class Tool:
    name: str
    description: str

    def execute(self, arguments: dict[str, Any], context: OrchestratorContext) -> ToolResult: ...


# ---------------------------------------------------------------------------
# Harness — Execution Layer with Timeout
# ---------------------------------------------------------------------------

class Harness:
    TOOL_TIMEOUT_S = 30  # 30s circuit breaker

    def __init__(self, tools: dict[str, Tool], config: OrchestratorConfig):
        self.tools = tools
        self.config = config
        self.logger = logging.getLogger("cassandra.harness")
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="harness_")

    def execute_tool(self, call: ToolCall, ctx: OrchestratorContext) -> ToolResult:
        start = datetime.now(timezone.utc)
        if not ctx.org_id:
            return self._fail(call, "MISSING_ORG_ID", start, ctx)
        if call.name not in self.tools:
            return self._fail(call, f"UNKNOWN_TOOL: '{call.name}'", start, ctx)

        try:
            future = self._executor.submit(self.tools[call.name].execute, call.arguments, ctx)
            result = future.result(timeout=self.TOOL_TIMEOUT_S)
            result.execution_ms = self._elapsed_ms(start)
            return result
        except FutureTimeout:
            self.logger.error(f"[HARNESS] TIMEOUT: {call.name} exceeded {self.TOOL_TIMEOUT_S}s")
            return self._fail(call, f"TOOL_TIMEOUT: {call.name} exceeded {self.TOOL_TIMEOUT_S}s", start, ctx)
        except Exception as exc:
            return self._fail(call, f"TOOL_RAISED: {type(exc).__name__}: {exc}", start, ctx)

    def execute_batch(self, calls: list[ToolCall], ctx: OrchestratorContext) -> list[ToolResult]:
        return [self.execute_tool(c, ctx) for c in calls]

    def _fail(self, call: ToolCall, error: str, start: datetime, ctx: OrchestratorContext) -> ToolResult:
        return ToolResult(
            call_id=call.call_id, tool_name=call.name, success=False, error=error,
            execution_ms=self._elapsed_ms(start), stage_at_execution=ctx.current_stage,
        )

    @staticmethod
    def _elapsed_ms(start: datetime) -> float:
        return (datetime.now(timezone.utc) - start).total_seconds() * 1000


# ---------------------------------------------------------------------------
# Orchestrator — 7-Agent Pipeline (Lightweight)
# ---------------------------------------------------------------------------

class Orchestrator:
    def __init__(self, config: OrchestratorConfig):
        self.config = config
        self.harness = Harness(self._build_tools(), config)
        self.logger = logging.getLogger("cassandra.orchestrator")
        self._agents: dict[str, Any] = {}

    def _load_agents(self):
        if self._agents:
            return self._agents
        from cassandra.agents.intent import IntentAgent
        from cassandra.agents.context import ContextAgent, MembershipCache
        from cassandra.agents.permission import PermissionAgent
        from cassandra.agents.retrieval import RetrievalAgent, SupermemoryClient
        from cassandra.agents.reasoning import ReasoningAgent
        from cassandra.agents.validation import ValidationAgent
        from cassandra.agents.response import ResponseAgent

        self._agents = {
            "intent": IntentAgent(),
            "context": ContextAgent(cache=MembershipCache()),
            "permission": PermissionAgent(),
            "retrieval": RetrievalAgent(supermemory_client=SupermemoryClient()),
            "reasoning": ReasoningAgent(),
            "validation": ValidationAgent(),
            "response": ResponseAgent(),
        }
        return self._agents

    def _build_tools(self) -> dict[str, Tool]:
        from cassandra.tools.sql_engine import SQLEngineTool
        from cassandra.tools.fetch_context import FetchContextTool
        from cassandra.tools.create_ticket import CreateTicketTool
        from cassandra.tools.voice_enroll import VoiceEnrollTool
        from cassandra.tools.calculate_date import CalculateDateTool

        registry: dict[str, Tool] = {}
        for cfg in self.config.tools:
            name = cfg.get("name")
            if name == "sql_engine": registry[name] = SQLEngineTool()
            elif name == "fetch_context": registry[name] = FetchContextTool()
            elif name == "create_ticket": registry[name] = CreateTicketTool()
            elif name == "voice_enroll": registry[name] = VoiceEnrollTool()
            elif name == "calculate_date": registry[name] = CalculateDateTool()
        return registry

    def run(self, message: str, history: list[dict[str, Any]]) -> OrchestratorResult:
        for chunk in self.run_stream(message, history):
            if chunk.event == "done":
                return OrchestratorResult(**chunk.data)
        raise RuntimeError("Master loop stream did not emit 'done' event")

    def run_stream(self, message: str, history: list[dict[str, Any]]):
        agents = self._load_agents()
        now = datetime.now(timezone.utc).isoformat()

        ctx = OrchestratorContext(
            org_id=self.config.org_id or "",
            user_id=self.config.user_id or "",
            role=self.config.role,
            conversation_history=history,
            current_timestamp=now,
            max_validation_iterations=self.config.max_validation_iterations,
            # FIX C0-11: Pass photo_url through to tool context
            photo_url=self.config.photo_url or None,
        )

        def _yield(step: str, msg: str):
            yield StreamChunk("reasoning", {"step": step, "message": msg})

        # ── AGENT 1: INTENT ─────────────────────────────────────────────
        ctx.current_stage = LoopStage.INTENT
        yield from _yield("intent", "Identifying intent...")
        intent = agents["intent"].run(message=message, current_timestamp=now)
        ctx.allowed_property_ids = self.config.tools[0].get("available_property_ids", []) if self.config.tools else []

        if intent.clarification_needed:
            yield StreamChunk("answer", {"text": intent.clarification_message or "Need more info"})
            yield StreamChunk("done", self._build_result(ctx, intent=intent, halted=True))
            return

        # ── AGENT 2: CONTEXT ───────────────────────────────────────────
        ctx.current_stage = LoopStage.CONTEXT
        yield from _yield("context", "Loading context...")
        ctx_result = agents["context"].run(user_id=ctx.user_id, org_id=ctx.org_id, role=ctx.role, conversation_history=history)
        ctx.allowed_property_ids = ctx_result.allowed_property_ids
        # Use property metadata from context agent, or fall back to config/tools
        if ctx_result.property_metadata:
            ctx.property_metadata = ctx_result.property_metadata
        elif self.config.tools and self.config.tools[0].get("property_metadata"):
            ctx.property_metadata = self.config.tools[0].get("property_metadata", {})

        # ── AGENT 3: PERMISSION ─────────────────────────────────────────
        ctx.current_stage = LoopStage.PERMISSION
        yield from _yield("permission", "Checking permissions...")
        permission = agents["permission"].verify_request(user_id=ctx.user_id, org_id=ctx.org_id, role=ctx.role, requested_org_id=ctx.org_id)
        if not permission.allowed:
            # FIX: Soft, role-aware denial message (never expose raw system errors)
            denial = agents["response"].format_denial(
                user_role=ctx.role,
                reason=permission.reason,
                tool_name=permission.tool_name,
            )
            yield StreamChunk("answer", {"text": denial.answer})
            yield StreamChunk("done", self._build_result(ctx, intent=intent, denied=True, response=denial))
            return

        # ── AGENT 4: RETRIEVAL ─────────────────────────────────────────
        ctx.current_stage = LoopStage.RETRIEVAL
        yield from _yield("retrieval", "Searching...")
        property_id = self._resolve_property(ctx, intent)
        retrieval = agents["retrieval"].run(query=message, org_id=ctx.org_id, property_id=property_id, intent_type=intent.intent.value, conversation_history=history)

        # ── AGENT 5: REASONING ────────────────────────────────────────
        ctx.current_stage = LoopStage.REASONING
        yield from _yield("reasoning", "Synthesizing...")
        reasoning = agents["reasoning"].run(user_message=message, retrieval_result=retrieval, intent_type=intent.intent.value, org_id=ctx.org_id, user_id=ctx.user_id, property_id=property_id)

        # ── TOOL EXECUTION ────────────────────────────────────────────
        if reasoning.tool_calls:
            ctx.current_stage = LoopStage.ACTION
            ctx.turn_count += 1
            if ctx.turn_count >= ctx.max_turns:
                yield StreamChunk("error", {"code": "SAFETY_LIMIT", "message": "Max turns reached"})
                return

            # FIX C0-16: Inject photo_url into create_ticket tool calls
            tool_calls = []
            for i, tc in enumerate(reasoning.tool_calls):
                args = tc.get("arguments", {})
                if tc["name"] == "create_ticket" and ctx.photo_url:
                    args = {**args, "photo_url": ctx.photo_url}
                tool_calls.append(ToolCall(name=tc["name"], arguments=args, call_id=f"call_{i}"))

            for tc in tool_calls:
                yield StreamChunk("tool_start", {"tool": tc.name})

            ctx.tool_results = self.harness.execute_batch(tool_calls, ctx)

            for tr in ctx.tool_results:
                yield StreamChunk("tool_result", {"tool": tr.tool_name, "success": tr.success, "message": tr.error or "Done"})

        # ── AGENT 6: VALIDATION LOOP ───────────────────────────────────
        answer = reasoning.answer_preview if reasoning.answer_ready else reasoning.plan
        tool_dicts = [{"tool_name": t.tool_name, "success": t.success, "result": t.result, "error": t.error} for t in ctx.tool_results]

        for i in range(1, ctx.max_validation_iterations + 1):
            ctx.current_stage = LoopStage.VALIDATION
            yield StreamChunk("validation", {"iteration": i, "message": f"Validating ({i}/{ctx.max_validation_iterations})..."})

            validation = agents["validation"].validate(
                answer=answer, tool_results=tool_dicts, cited_sources=retrieval.cited_sources,
                user_role=ctx.role, org_id=ctx.org_id, property_id=property_id, iteration=i,
                reasoning_agent_output=reasoning,
            )

            if validation.passed:
                answer = validation.final_answer or answer
                yield StreamChunk("validation", {"iteration": i, "message": "Verified ✓", "passed": True})
                break

            errors = "; ".join(validation.errors[:3])
            yield StreamChunk("validation", {"iteration": i, "message": "Correcting...", "passed": False})
            answer = f"[SELF-CORRECT {i}/3] Errors: {errors}\nPlease correct."
        else:
            yield StreamChunk("validation", {"iteration": 3, "message": "Using fallback", "passed": False})
            validation = agents["validation"].generate_fallback_answer(user_message=message, intent_type=intent.intent.value, org_id=ctx.org_id)
            answer = validation.final_answer

        # ── AGENT 7: RESPONSE ────────────────────────────────────────
        ctx.current_stage = LoopStage.RESPONSE
        yield from _yield("response", "Formatting...")
        response = agents["response"].format(
            answer=answer, cited_sources=retrieval.cited_sources, tool_results=tool_dicts,
            intent_type=intent.intent.value, user_role=ctx.role, confidence=reasoning.confidence,
            fallback_triggered=validation.fallback_triggered,
        )

        yield StreamChunk("answer", {"text": response.answer})
        if response.citations:
            yield StreamChunk("citation", {"sources": response.citations})

        yield StreamChunk("done", self._build_result(ctx, intent=intent, retrieval=retrieval, reasoning=reasoning, validation=validation, response=response))

    def _resolve_property(self, ctx: OrchestratorContext, intent: Any) -> str | None:
        """Resolve property from intent entities, with fuzzy name fallback."""
        entities = getattr(intent, "extracted_entities", {})

        # Direct property_id match
        if "property_id" in entities:
            pid = entities["property_id"]
            if pid in ctx.allowed_property_ids:
                return pid

        # Fuzzy property name matching (e.g. "SS Plaza" → property_id)
        property_name = entities.get("property_name", "")
        if property_name and ctx.property_metadata:
            name_lower = property_name.lower()
            for pid, meta in ctx.property_metadata.items():
                prop_name = meta.get("name", "").lower()
                prop_code = meta.get("code", "").lower()
                # Exact or substring match
                if name_lower in prop_name or prop_name in name_lower:
                    return pid
                # Code match (e.g. "SS" matches code "SS_PLAZA")
                if name_lower in prop_code or prop_code in name_lower:
                    return pid

        # Single-property auto-resolve
        if len(ctx.allowed_property_ids) == 1:
            return ctx.allowed_property_ids[0]

        return None

    def _build_result(self, ctx: OrchestratorContext, intent: Any = None, retrieval: Any = None, reasoning: Any = None, validation: Any = None, response: Any = None, halted: bool = False, denied: bool = False) -> dict:
        if halted:
            return {"response": intent.clarification_message if intent else "", "citations": [], "tools_used": [], "turns": 0, "stage": "halted", "intent": getattr(intent.intent, "value", "unknown") if intent else "unknown", "confidence": 0.0, "validation_passed": False, "validation_iterations": 0, "fallback_triggered": False, "requires_clarification": True}
        if denied:
            return {"response": getattr(response, "answer", "Permission denied. Contact your administrator."), "citations": [], "tools_used": [], "turns": 0, "stage": "halted", "intent": getattr(intent.intent, "value", "unknown") if intent else "unknown", "confidence": 0.0, "validation_passed": False, "validation_iterations": 0, "fallback_triggered": False, "requires_clarification": False, "internal_trace": getattr(response, "internal_trace", {})}
        return {"response": response.answer, "citations": response.citations, "tools_used": response.tools_used, "turns": ctx.turn_count, "stage": ctx.current_stage.value, "intent": intent.intent.value, "confidence": reasoning.confidence, "validation_passed": validation.passed, "validation_iterations": 0, "fallback_triggered": validation.fallback_triggered, "requires_clarification": False, "internal_trace": getattr(response, "internal_trace", {})}


@dataclass
class StreamChunk:
    event: str
    data: dict


@dataclass
class OrchestratorResult:
    response: str
    citations: list[dict]
    tools_used: list[str]
    tool_results: list[ToolResult]
    turns: int
    stage: LoopStage
    intent: str
    confidence: float
    validation_passed: bool
    validation_iterations: int
    fallback_triggered: bool
    requires_clarification: bool
    clarification_message: str | None
    internal_trace: dict
