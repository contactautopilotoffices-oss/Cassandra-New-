"""
Create Ticket Tool — Feature Service (Domain Action)
===================================================

High-level tool for creating a maintenance ticket.

This is a Feature Service tool — it wraps the SQL Engine and applies
business logic specific to ticket creation.

Module: 4.1
Status: ACTIVE
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

# ---------------------------------------------------------------------------
# Supabase config (same pattern as query_tickets / sql_engine)
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
        "Prefer": "return=representation",
    }

# ---------------------------------------------------------------------------
# Create Ticket Tool
# ---------------------------------------------------------------------------

class CreateTicketTool(Tool):
    """
    Tool for creating a maintenance ticket in the FMS.

    Arguments:
        title: str — Ticket title (required)
        description: str — Detailed description
        priority: str — "low", "medium", "high", "critical" (default: "medium")
        category: str — Category UUID
        property_id: str — Property UUID (required)
        is_internal: bool — Internal ticket (default: False)
        photo_url: str — Photo URL from mobile upload (optional)

    Returns:
        ToolResult with created ticket data

    Business Logic:
        - org_id injected from OrchestratorContext (non-negotiable)
        - raised_by set to context.user_id
        - status set to "open"
        - Timestamps auto-generated
        - Persists to FMS via Fastify /tickets endpoint
    """

    name = "create_ticket"
    description = (
        "Create a new maintenance ticket in the facility management system. "
        "Non-negotiable: org_id is injected from context, "
        "raised_by is set to the current user. "
        "Returns the created ticket with ID."
    )

    VALID_PRIORITIES = {"low", "medium", "high", "critical"}

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        """
        Create a ticket with business logic applied.
        """
        call_id = f"create_ticket_{context.turn_count}"

        # Validate required arguments
        title: str = arguments.get("title", "")
        if not title:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_TITLE: 'title' argument is required",
            )

        # Use argument property_id first; fall back to context.property_id
        # (LLM sometimes omits it even when it's available from session context)
        property_id: str = (
            arguments.get("property_id", "")
            or getattr(context, "property_id", "")
        )
        if not property_id:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_PROPERTY_ID: Cannot create ticket — no property selected in this session",
            )

        # Validate priority
        priority: str = arguments.get("priority", "medium").lower()
        if priority not in self.VALID_PRIORITIES:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error=f"INVALID_PRIORITY: '{priority}' not in {self.VALID_PRIORITIES}",
            )

        # org_id enforcement (Non-negotiable)
        if not context.org_id:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_ORG_ID: Cannot create ticket without org_context",
            )

        # Build ticket record
        ticket_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # FIX C0-11: Accept photo_url from mobile (via arguments or context)
        photo_url = (
            arguments.get("photo_url")
            or getattr(context, "photo_url", None)
            or None
        )

        # Build minimal ticket with only fields that have values
        # (avoids hitting non-existent columns in Supabase schema)
        ticket: dict[str, Any] = {
            "id": ticket_id,
            "title": title,
            "description": arguments.get("description", ""),
            "priority": priority,
            "property_id": property_id,
            "organization_id": context.org_id,  # Injected (non-negotiable)
            "raised_by": context.user_id,  # Set from context
            "status": "open",
            "created_at": now,
            "updated_at": now,
        }
        if photo_url:
            ticket["photo_before_url"] = photo_url
        if arguments.get("assigned_to"):
            ticket["assigned_to"] = arguments["assigned_to"]
        if arguments.get("is_internal"):
            ticket["is_internal"] = True
        if arguments.get("category"):
            ticket["category"] = arguments["category"]  # mobile uses 'category' not 'category_id'

        # Persist ticket directly to Supabase (Fastify removed from architecture)
        persist_error = None
        if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
            try:
                with httpx.Client(timeout=10.0) as client:
                    resp = client.post(
                        f"{SUPABASE_URL}/rest/v1/tickets",
                        json=ticket,
                        headers=_supabase_headers(),
                    )
                    if not resp.is_success:
                        persist_error = f"Supabase returned {resp.status_code}: {resp.text[:200]}"
                        logging.getLogger("cassandra.tools.create_ticket").warning(
                            f"[CREATE_TICKET] Persist failed: {persist_error}"
                        )
                    else:
                        logging.getLogger("cassandra.tools.create_ticket").info(
                            f"[CREATE_TICKET] Persisted to Supabase: {ticket_id}"
                        )
            except Exception as exc:
                persist_error = str(exc)
                logging.getLogger("cassandra.tools.create_ticket").error(
                    f"[CREATE_TICKET] Persist error: {exc}"
                )
        else:
            persist_error = "Supabase credentials not configured"

        logging.getLogger("cassandra.tools.create_ticket").info(
            f"[CREATE_TICKET] Created: {ticket_id} "
            f"(title='{title}', org={context.org_id}, user={context.user_id}, "
            f"photo={'yes' if photo_url else 'no'}, persist={'ok' if not persist_error else 'failed'})"
        )

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=persist_error is None,
            result={
                "ticket": ticket,
                "message": f"Ticket '{title}' created successfully" if not persist_error else f"Ticket created locally but persist failed: {persist_error}",
                "org_id": context.org_id,
                "persisted": persist_error is None,
                "persist_error": persist_error,
            },
        )
