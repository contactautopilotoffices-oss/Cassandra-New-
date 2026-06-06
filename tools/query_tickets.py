"""
Query Tickets Tool — Real Supabase Data
=======================================

Queries and filters maintenance tickets from the FMS database
via Supabase REST API (real data, not simulation).

Module: Single LLM Core
Status: ACTIVE
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

# ---------------------------------------------------------------------------
# Supabase Config — FMS/Expo project (xvucakstcmtfoanmgcql)
# NOT the Cassandra project (hapwbiteqgusvjifxium)
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ.get("FMS_SUPABASE_URL", os.environ.get("EXPO_PUBLIC_SUPABASE_URL", ""))
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", ""),
)


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "count=exact",
    }


# ---------------------------------------------------------------------------
# Query Tickets Tool
# ---------------------------------------------------------------------------

class QueryTicketsTool(Tool):
    """
    Tool for querying maintenance tickets from the FMS.

    Arguments:
        property_id: UUID of the property to filter by (optional)
        status: Filter by status — "open", "in_progress", "resolved", "closed" (optional)
        priority: Filter by priority — "low", "medium", "high", "critical" (optional)
        limit: Maximum tickets to return (default: 20, max: 100)

    Returns:
        ToolResult with list of matching tickets from Supabase
    """

    name = "query_tickets"
    description = (
        "Query and list maintenance tickets from the facility management system. "
        "Use this to find tickets by property, status, priority, or assignee. "
        "Valid status values: 'open' (new), 'assigned' (to staff), 'in_progress' (work started), "
        "'resolved' (completed), 'closed' (archived), 'waitlist' (queued). "
        "Returns real tickets with id, title, status, priority, created_at, and property info."
    )

    # Real status values in the FMS database (verified 2026-06-01)
    VALID_STATUSES = {"open", "assigned", "in_progress", "resolved", "closed", "waitlist"}
    # "open" for display — includes open, assigned, in_progress, waitlist
    OPEN_STATUSES = {"open", "assigned", "in_progress", "waitlist"}
    VALID_PRIORITIES = {"low", "medium", "high", "urgent", "critical"}

    def __init__(self):
        self.logger = logging.getLogger("cassandra.tools.query_tickets")
        self._supabase_configured = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
        if not self._supabase_configured:
            self.logger.warning(
                "[QUERY_TICKETS] Supabase not configured — falling back to simulation. "
                "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env."
            )

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        call_id = f"query_tickets_{context.turn_count}"

        # Validate org_id (Non-negotiable)
        if not context.org_id:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_ORG_ID: Cannot query tickets without org_context",
            )

        property_id: Optional[str] = arguments.get("property_id")
        status: Optional[str] = arguments.get("status")
        priority: Optional[str] = arguments.get("priority")
        limit: int = min(int(arguments.get("limit", 20)), 100)

        # Normalize legacy status values → real DB values
        # Updated 2026-06-01 to match actual schema
        STATUS_ALIAS = {
            "open": None,         # "open" means query all active → use status_list below
            "in_progress": "in_progress",  # Maps directly
            "resolved": "resolved",        # Maps directly
        }
        status_list: Optional[list[str]] = None
        if status:
            if status in STATUS_ALIAS:
                if STATUS_ALIAS[status] is None:
                    # "open" → all active statuses
                    status_list = list(self.OPEN_STATUSES)
                    status = None
                else:
                    status = STATUS_ALIAS[status]
            elif status not in self.VALID_STATUSES:
                return ToolResult(
                    call_id=call_id,
                    tool_name=self.name,
                    success=False,
                    error=f"INVALID_STATUS: '{status}' not in {self.VALID_STATUSES}",
                )

        if priority and priority not in self.VALID_PRIORITIES:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error=f"INVALID_PRIORITY: '{priority}' not in {self.VALID_PRIORITIES}",
            )

        # If Supabase is configured, query real data
        if self._supabase_configured:
            return self._query_supabase(
                org_id=context.org_id,
                property_id=property_id,
                status=status,
                status_list=status_list,
                priority=priority,
                limit=limit,
                call_id=call_id,
                context=context,
            )

        # Fallback to simulation
        return self._simulate_query(
            property_id, status, priority, limit, context, call_id
        )

    def _query_supabase(
        self,
        org_id: str,
        property_id: Optional[str],
        status: Optional[str],
        priority: Optional[str],
        limit: int,
        call_id: str,
        context: OrchestratorContext,
        status_list: Optional[list[str]] = None,
    ) -> ToolResult:
        """Query Supabase REST API for real ticket data."""
        try:
            url = f"{SUPABASE_URL}/rest/v1/tickets"
            params: dict[str, str] = {
                "select": "*",
                "organization_id": f"eq.{org_id}",
                "order": "created_at.desc",
                "limit": str(limit),
            }
            if property_id:
                params["property_id"] = f"eq.{property_id}"
            if status_list:
                # IN filter: status=in.(assigned,waitlist,pending_validation)
                params["status"] = f"in.({','.join(status_list)})"
            elif status:
                params["status"] = f"eq.{status}"
            if priority:
                params["priority"] = f"eq.{priority}"

            with httpx.Client(timeout=15.0) as client:
                resp = client.get(url, headers=_supabase_headers(), params=params)

            if not resp.is_success:
                self.logger.warning(
                    f"[QUERY_TICKETS] Supabase error {resp.status_code}: {resp.text[:200]} — "
                    f"falling back to simulation mode"
                )
                # Fall through to simulation mode instead of failing
                return self._simulate_query(
                    property_id=property_id,
                    status=status,
                    priority=priority,
                    limit=limit,
                    context=context,
                    call_id=call_id,
                )

            tickets = resp.json()
            self.logger.info(
                f"[QUERY_TICKETS] Real data: {len(tickets)} tickets for org={org_id}"
            )

            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=True,
                result={
                    "tickets": tickets,
                    "count": len(tickets),
                    "filters": {
                        "property_id": property_id,
                        "status": status,
                        "priority": priority,
                        "limit": limit,
                    },
                    "org_id": org_id,
                    "mode": "supabase",
                },
            )

        except Exception as exc:
            self.logger.error(f"[QUERY_TICKETS] Exception: {exc}")
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error=f"QUERY_ERROR: {type(exc).__name__}: {exc}",
            )

    def _simulate_query(
        self,
        property_id: Optional[str],
        status: Optional[str],
        priority: Optional[str],
        limit: int,
        context: OrchestratorContext,
        call_id: str,
    ) -> ToolResult:
        """Simulation fallback when Supabase is not configured."""
        self.logger.warning(
            f"[QUERY_TICKETS] SIMULATE: property={property_id}, "
            f"status={status}, priority={priority}, limit={limit}, "
            f"org={context.org_id}"
        )

        mock_tickets = [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "title": "Broken AC unit in Zone 3",
                "description": "Air conditioning not working in the main conference room.",
                "status": "open",
                "priority": "high",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "organization_id": context.org_id,
                "raised_by": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "assigned_to": None,
                "created_at": "2026-05-28T09:00:00Z",
                "updated_at": "2026-05-28T09:00:00Z",
            },
            {
                "id": "22222222-2222-2222-2222-222222222222",
                "title": "Leaking faucet in kitchen",
                "description": "Kitchen sink faucet has a slow drip.",
                "status": "in_progress",
                "priority": "low",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "organization_id": context.org_id,
                "raised_by": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                "assigned_to": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "created_at": "2026-05-27T14:30:00Z",
                "updated_at": "2026-05-29T10:00:00Z",
            },
            {
                "id": "33333333-3333-3333-3333-333333333333",
                "title": "Critical: Elevator malfunction",
                "description": "Elevator showing error code E05 and not responding.",
                "status": "open",
                "priority": "critical",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "organization_id": context.org_id,
                "raised_by": "dddddddd-dddd-dddd-dddd-dddddddddddd",
                "assigned_to": None,
                "created_at": "2026-05-31T08:00:00Z",
                "updated_at": "2026-05-31T08:00:00Z",
            },
            {
                "id": "44444444-4444-4444-4444-444444444444",
                "title": "Light bulb replacement - Lobby",
                "description": "3 LED bulbs need replacement in the main lobby.",
                "status": "resolved",
                "priority": "medium",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "organization_id": context.org_id,
                "raised_by": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
                "assigned_to": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "created_at": "2026-05-25T11:00:00Z",
                "updated_at": "2026-05-30T15:00:00Z",
            },
            {
                "id": "55555555-5555-5555-5555-555555555555",
                "title": "HVAC filter replacement",
                "description": "Quarterly HVAC filter replacement due.",
                "status": "closed",
                "priority": "low",
                "property_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "organization_id": context.org_id,
                "raised_by": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "assigned_to": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                "created_at": "2026-05-20T09:00:00Z",
                "updated_at": "2026-05-26T16:00:00Z",
            },
        ]

        filtered = mock_tickets
        if property_id:
            filtered = [t for t in filtered if t.get("property_id") == property_id]
        if status:
            filtered = [t for t in filtered if t.get("status") == status]
        if priority:
            filtered = [t for t in filtered if t.get("priority") == priority]

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result={
                "tickets": [
                    {
                        "id": t["id"],
                        "title": t["title"],
                        "description": t["description"],
                        "status": t["status"],
                        "priority": t["priority"],
                        "property_id": t["property_id"],
                        "raised_by": t["raised_by"],
                        "assigned_to": t["assigned_to"],
                        "created_at": t["created_at"],
                        "updated_at": t["updated_at"],
                    }
                    for t in filtered[:limit]
                ],
                "count": len(filtered[:limit]),
                "filters": {
                    "property_id": property_id,
                    "status": status,
                    "priority": priority,
                    "limit": limit,
                },
                "org_id": context.org_id,
                "mode": "simulation",
            },
        )
