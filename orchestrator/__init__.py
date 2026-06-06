"""
Orchestrator Package — Shared Types and Tool Interface
====================================================

Single source of truth for tool interface types.
Used by:
- cassandra/llm/orchestrator.py (LLM core)
- cassandra/tools/*.py (tool implementations)

Module: Single LLM Core
Status: ACTIVE
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Tool Interface
# ---------------------------------------------------------------------------

class Tool:
    """Base class for tools available to the LLM orchestrator."""

    name: str = ""
    description: str = ""

    def execute(self, arguments: dict[str, Any], context: OrchestratorContext) -> ToolResult:
        """Execute the tool with the given arguments and context."""
        raise NotImplementedError


@dataclass
class ToolResult:
    """Result from tool execution."""
    call_id: str
    tool_name: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    execution_ms: float = 0.0


# ---------------------------------------------------------------------------
# Orchestrator Context
# ---------------------------------------------------------------------------

@dataclass
class OrchestratorContext:
    """
    Context passed to every tool execution.

    Contains all the information the tool needs to operate correctly:
    - org_id: The tenant scope (non-negotiable)
    - user_id: The current user
    - property_id: The currently selected property
    - role: The user's role
    - photo_url: Photo URL from mobile upload (C0-11/C0-16)
    - conversation_history: Recent conversation for context
    - allowed_property_ids: Properties the user can access
    """
    org_id: str = ""
    user_id: str = ""
    property_id: str = ""  # Added 2026-06-01 - currently selected property
    role: str = "tenant"
    conversation_history: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    turn_count: int = 0
    max_turns: int = 20
    max_validation_iterations: int = 3
    allowed_property_ids: list[str] = field(default_factory=list)
    property_metadata: dict[str, dict] = field(default_factory=dict)  # id → {name, code}
    current_timestamp: str = ""
    # C0-11: Photo URL from mobile upload
    photo_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Orchestrator Config
# ---------------------------------------------------------------------------

@dataclass
class OrchestratorConfig:
    """Configuration for the LLM orchestrator."""
    max_turns: int = 20
    max_validation_iterations: int = 3
    tools: list[dict[str, Any]] = field(default_factory=list)
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    role: str = "tenant"
    trace: bool = True
    # C0-11: Photo URL from mobile upload
    photo_url: Optional[str] = None


__all__ = [
    "Tool",
    "ToolResult",
    "OrchestratorContext",
    "OrchestratorConfig",
]
