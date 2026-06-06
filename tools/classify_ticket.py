"""
Classify Ticket Tool — Deterministic Priority & Category Detection
==================================================================

Analyzes a ticket's title + description and assigns a priority
(critical / urgent / high / medium / low) using transparent keyword rules.
Pure Python, ZERO network calls — it cannot fail at runtime, which is exactly
what a pre-create classification step needs.

The orchestrator chains this BEFORE create_ticket:
  classify_ticket → reads `apply_priority` → injects into create_ticket args.

Output contract (consumed by orchestrator.py create_ticket chaining):
  - apply_priority   : one of low|medium|high|urgent|critical  (REQUIRED)
  - priority         : same value (human-facing alias)
  - priority_reason  : short explanation of why
  - suggested_category: best-guess category label (free text, advisory)
  - category_id      : "" (left blank — category UUIDs are property-scoped;
                        create_ticket resolves the real UUID if needed)

Module: 4.2 (Ticket Intelligence)
Status: ACTIVE
"""

from __future__ import annotations

import logging
from typing import Any

from cassandra.orchestrator import Tool, ToolResult, OrchestratorContext

logger = logging.getLogger("cassandra.tools.classify_ticket")


# ---------------------------------------------------------------------------
# Keyword → priority rules (ordered: first match by severity wins)
# ---------------------------------------------------------------------------
# Each tier lists trigger phrases. We scan critical → low and stop at the
# highest-severity tier that matches, so "small fire" still reads critical.
_PRIORITY_RULES: list[tuple[str, list[str]]] = [
    ("critical", [
        "fire", "flood", "gas leak", "smoke", "electrocution", "explosion",
        "collapse", "burst pipe", "sewage", "trapped", "stuck in lift",
        "stuck in elevator", "no power", "power outage", "short circuit",
        "live wire", "sparking", "evacuat", "injury", "injured", "bleeding",
        "fall", "fell", "gas smell", "carbon monoxide",
    ]),
    ("urgent", [
        "leak", "leaking", "no water", "water supply", "no electricity",
        "ac not working", "ac down", "air conditioning", "lift not working",
        "elevator not working", "security", "break-in", "theft", "intrusion",
        "overflow", "flooding", "blocked drain", "outage", "not cooling",
        "no internet", "network down",
    ]),
    ("high", [
        "not working", "broken", "malfunction", "malfunctioning", "damaged",
        "damage", "fault", "faulty", "tripping", "noise", "noisy", "vibration",
        "smell", "odor", "pest", "infestation", "clogged", "jammed",
        "door not", "lock", "leakage",
    ]),
    ("low", [
        "paint", "painting", "cosmetic", "scratch", "cleaning", "clean",
        "polish", "minor", "touch up", "touch-up", "request", "replace bulb",
        "light flicker", "signage", "label", "aesthetic", "decor",
    ]),
]

_DEFAULT_PRIORITY = "medium"


# ---------------------------------------------------------------------------
# Keyword → category hint (advisory only — create_ticket owns the real UUID)
# ---------------------------------------------------------------------------
_CATEGORY_HINTS: list[tuple[str, list[str]]] = [
    ("Electrical", ["power", "electric", "wire", "socket", "switch", "light",
                    "bulb", "short circuit", "sparking", "voltage", "mcb"]),
    ("Plumbing", ["water", "leak", "pipe", "drain", "tap", "faucet", "toilet",
                  "flush", "sewage", "overflow", "clogged"]),
    ("HVAC", ["ac", "air conditioning", "cooling", "heating", "hvac",
              "ventilation", "thermostat", "chiller", "fan"]),
    ("Elevator", ["lift", "elevator", "escalator"]),
    ("Security", ["security", "cctv", "camera", "break-in", "theft",
                  "intrusion", "access", "lock", "door"]),
    ("Fire Safety", ["fire", "smoke", "extinguisher", "alarm", "sprinkler",
                     "gas leak", "carbon monoxide"]),
    ("Housekeeping", ["clean", "cleaning", "garbage", "trash", "pest",
                      "infestation", "wash", "hygiene"]),
    ("Civil", ["wall", "ceiling", "floor", "tile", "paint", "crack",
               "leakage", "seepage", "plaster"]),
]


def _match_priority(text: str) -> tuple[str, str]:
    """Return (priority, reason). Scans highest severity first."""
    for priority, keywords in _PRIORITY_RULES:
        for kw in keywords:
            if kw in text:
                return priority, f"matched '{kw}'"
    return _DEFAULT_PRIORITY, "no severity keywords matched — default"


def _match_category(text: str) -> str:
    """Return best-guess category label, or '' if none."""
    for label, keywords in _CATEGORY_HINTS:
        for kw in keywords:
            if kw in text:
                return label
    return ""


def classify_ticket(title: str, description: str = "") -> dict[str, Any]:
    """
    Pure function: classify a ticket from its title + description.

    Returns a dict with apply_priority, priority, priority_reason,
    suggested_category, category_id.
    """
    text = f"{title} {description}".lower()

    priority, reason = _match_priority(text)
    category = _match_category(text)

    return {
        "apply_priority": priority,       # read by orchestrator chaining
        "priority": priority,             # human-facing alias
        "priority_reason": reason,
        "suggested_category": category,
        "apply_category": "",             # no blind UUID — create_ticket resolves
        "category_id": "",
    }


class ClassifyTicketTool(Tool):
    """
    Deterministic ticket classifier. Chained before create_ticket so new
    tickets get a sensible priority without a second LLM round-trip.
    """

    name = "classify_ticket"
    description = "Classify a ticket's priority and suggested category from its title/description."

    def execute(self, arguments: dict[str, Any], context: OrchestratorContext) -> ToolResult:
        call_id = f"classify_ticket_{getattr(context, 'turn_count', 0)}"

        title = (arguments.get("title") or "").strip()
        description = (arguments.get("description") or "").strip()

        if not title and not description:
            # Nothing to classify — return a safe default rather than failing,
            # so the create_ticket chain still proceeds with medium priority.
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=True,
                result={
                    "apply_priority": _DEFAULT_PRIORITY,
                    "priority": _DEFAULT_PRIORITY,
                    "priority_reason": "no title/description provided — default",
                    "suggested_category": "",
                    "apply_category": "",
                    "category_id": "",
                },
            )

        classification = classify_ticket(title, description)
        logger.info(
            f"[CLASSIFY] '{title[:40]}' → {classification['apply_priority']} "
            f"({classification['priority_reason']}); category={classification['suggested_category'] or 'none'}"
        )

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result=classification,
        )
