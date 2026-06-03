"""
Health Score Tool — Deterministic Property Health Computation
=============================================================

Computes a property/org "health score" from REAL ticket data, deterministically,
in Python. Does NOT route through the SQL parser (which cannot evaluate
COUNT(*) FILTER, NULLIF, arithmetic, or CURRENT_DATE - INTERVAL — it passes those
literals straight to PostgREST, which silently returns garbage).

Instead it computes the date window in Python and issues plain PostgREST
count=exact requests — the one query shape the stack is proven to handle.

Health % = (resolved + closed tickets) / (total tickets) over the window.
A transparent 1–10 rating is derived as resolution_rate / 10, clamped to [1, 10],
so it is fully reproducible and never fabricated.

Module: 4.2
Status: ACTIVE
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

# ---------------------------------------------------------------------------
# Supabase config — same resolution order as sql_engine / create_ticket
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("FMS_SUPABASE_URL", os.environ.get("EXPO_PUBLIC_SUPABASE_URL", ""))
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", ""),
)

logger = logging.getLogger("cassandra.tools.health_score")

# Tickets considered "done" for the health numerator
DONE_STATUSES = ("resolved", "closed")
# Tickets considered actively open (for the critical-open signal)
OPEN_STATUSES = ("open", "assigned", "in_progress")
# Priorities that count as critical-open pressure
HIGH_PRIORITIES = ("urgent", "critical")


def _headers(count: bool = False) -> dict[str, str]:
    h = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }
    if count:
        # count=exact makes PostgREST return the total in the Content-Range header.
        h["Prefer"] = "count=exact"
        # Range 0-0 → fetch a single row body; the count still comes back exact.
        h["Range-Unit"] = "items"
        h["Range"] = "0-0"
    return h


class HealthScoreTool(Tool):
    """
    Deterministically compute a property/org health score from ticket data.

    Arguments:
        property_id: str  — optional; scope to one property. Falls back to
                            context.property_id. Omit/empty for org-wide.
        window_days: int  — look-back window in days (default 30).

    Returns ToolResult.result:
        {
          "health_score": 78.5,         # resolution rate %, 1 decimal
          "rating_out_of_10": 7.9,      # resolution_rate / 10, clamped [1,10]
          "resolved_closed": 47,
          "total": 60,
          "sla_breached": 3,
          "critical_open": 2,
          "window_days": 30,
          "scope": "property" | "organization",
          "property_id": "<uuid>" | None,
          "formula": "health = (resolved+closed)/total*100; rating = health/10",
        }
    """

    name = "health_score"
    description = (
        "Compute a property or organization HEALTH SCORE from real ticket data. "
        "Use this for ANY question about property health, how well a property is "
        "doing, a 1-10 rating, or comparing properties. Returns resolution rate, "
        "SLA breaches, critical-open count, and a reproducible rating. "
        "Pass property_id to scope to one property; omit it for the whole org. "
        "For 'compare across properties', call this once per property_id."
    )

    def __init__(self):
        self._configured = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
        if not self._configured:
            logger.warning("[HEALTH_SCORE] Supabase not configured")

    # ------------------------------------------------------------------
    def execute(self, arguments: dict[str, Any], context: OrchestratorContext) -> ToolResult:
        call_id = f"health_score_{getattr(context, 'turn_count', 0)}"

        if not context.org_id:
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error="MISSING_ORG_ID: Cannot compute health without org context")

        if not self._configured:
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error="Supabase not configured — set FMS_SUPABASE_URL and AUTH_SUPABASE_SERVICE_ROLE_KEY")

        # Window
        try:
            window_days = int(arguments.get("window_days") or 30)
        except (TypeError, ValueError):
            window_days = 30
        if window_days <= 0:
            window_days = 30

        cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).strftime("%Y-%m-%dT%H:%M:%S")

        # Scope is driven by the EXPLICIT argument only. Do NOT fall back to the
        # session property_id: the prompt contract is "pass property_id for one
        # property, omit it for org-wide". Falling back here would make org-wide
        # health unreachable whenever a session property exists — silently
        # returning a single-property number labelled as if it were the answer.
        property_id = (arguments.get("property_id") or "").strip()
        scope = "property" if property_id else "organization"

        base = [
            ("organization_id", f"eq.{context.org_id}"),
            ("created_at", f"gte.{cutoff}"),
            ("select", "id"),
        ]
        if property_id:
            base.append(("property_id", f"eq.{property_id}"))

        url = f"{SUPABASE_URL}/rest/v1/tickets"

        try:
            with httpx.Client(timeout=15.0) as client:
                total = self._count(client, url, base)
                done = self._count(client, url, base + [("status", f"in.({','.join(DONE_STATUSES)})")])
                breached = self._count(client, url, base + [("sla_breached", "eq.true")])
                critical_open = self._count(
                    client, url,
                    base + [
                        ("status", f"in.({','.join(OPEN_STATUSES)})"),
                        ("priority", f"in.({','.join(HIGH_PRIORITIES)})"),
                    ],
                )
        except Exception as exc:
            logger.error(f"[HEALTH_SCORE] Error: {exc}", exc_info=True)
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error=f"EXEC_ERROR: {type(exc).__name__}: {exc}")

        if total is None or done is None:
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error="HEALTH_QUERY_FAILED: could not retrieve ticket counts from Supabase")

        health = round(done / total * 100, 1) if total else 0.0
        # Transparent, reproducible rating: resolution rate / 10, clamped to [1, 10].
        rating = round(min(10.0, max(1.0, health / 10.0)), 1) if total else 1.0

        logger.info(
            f"[HEALTH_SCORE] scope={scope} health={health}% done={done}/{total} "
            f"breached={breached} crit_open={critical_open} window={window_days}d org={context.org_id}"
        )

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result={
                "health_score": health,
                "rating_out_of_10": rating,
                "resolved_closed": done,
                "total": total,
                "sla_breached": breached if breached is not None else 0,
                "critical_open": critical_open if critical_open is not None else 0,
                "window_days": window_days,
                "scope": scope,
                "property_id": property_id or None,
                "formula": "health = (resolved+closed)/total*100 ; rating = health/10 (clamped 1-10)",
            },
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _count(client: httpx.Client, url: str, params: list[tuple[str, str]]) -> Optional[int]:
        """Return exact row count via PostgREST Content-Range, or None on error."""
        resp = client.get(url, headers=_headers(count=True), params=params)
        if not resp.is_success:
            logger.warning(f"[HEALTH_SCORE] count failed {resp.status_code}: {resp.text[:160]}")
            return None
        cr = resp.headers.get("content-range", "*/0")  # e.g. "0-0/47" or "*/0"
        try:
            return int(cr.split("/")[-1])
        except (ValueError, IndexError):
            # Fallback: length of returned body
            try:
                return len(resp.json())
            except Exception:
                return None
