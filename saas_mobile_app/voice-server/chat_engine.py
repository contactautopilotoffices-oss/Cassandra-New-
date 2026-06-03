"""
Cassandra Chat Engine — Natural language → Supabase query router.

Reads the user's JWT from the Authorization header, queries Supabase REST API
with RLS enforcement, and streams back natural-language responses.

REPORT ENGINE: Queries multiple tables (tickets, visitors, stock, users,
properties, electricity, diesel, sop_completions) and consolidates into
structured reports. No single "reports" table exists — reports are computed.
"""

import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from typing import AsyncGenerator

import httpx

from env_loader import load_shared_env

load_shared_env()

SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    os.getenv("EXPO_PUBLIC_SUPABASE_URL", "https://xvucakstcmtfoanmgcql.supabase.co"),
)
SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    os.getenv(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTU2MjQ0MDAsImV4cCI6MjAzMTIwMDQwMH0.a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
    ),  # noqa: S105
)

HEADERS_BASE = {
    "apikey": SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
}


# ─── Supabase REST helpers ──────────────────────────────────────────────────

async def _supabase_get(jwt: str, table: str, params: dict | None = None) -> list:
    """Query Supabase REST API with user's JWT for RLS."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**HEADERS_BASE, "Authorization": f"Bearer {jwt}", "Prefer": "count=exact"}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, headers=headers, params=params or {}, timeout=10.0)
            r.raise_for_status()
            return r.json() if r.text else []
        except Exception:
            return []


async def _supabase_rpc(jwt: str, fn: str, payload: dict | None = None) -> any:
    """Call a Supabase RPC with user's JWT for RLS."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn}"
    headers = {**HEADERS_BASE, "Authorization": f"Bearer {jwt}"}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(url, headers=headers, json=payload or {}, timeout=10.0)
            r.raise_for_status()
            return r.json() if r.text else None
        except Exception:
            return None


# ─── Intent detection ───────────────────────────────────────────────────────

def _intent(message: str) -> str:
    """Simple regex-based intent detection."""
    m = message.lower()

    # Reports / summaries / analytics — must come before other intents
    if re.search(r"\b(report|summary|summarise|overview|analytics|stats|last\s+(week|month|quarter|q\d|7\s*days|30\s*days)|this\s+(week|month|quarter)|dashboard)\b", m):
        return "reports"

    if re.search(r"\b(ticket|triage|open.*ticket|critical|high.*priority|assigned|resolved|closed)\b", m):
        return "tickets"
    if re.search(r"\b(energy|electricity|power|kwh|unit|consumption|spike)\b", m):
        return "energy"
    if re.search(r"\b(staff|on.call|oncall|who.*working|who.*duty|employee|team)\b", m):
        return "staff"
    if re.search(r"\b(checklist|sop|standard|procedure|completion|compliance)\b", m):
        return "checklist"
    if re.search(r"\b(health|score|status|condition|wellbeing)\b", m):
        return "health"
    if re.search(r"\b(visitor|guest|check.in|checkin|vms|appointment)\b", m):
        return "visitors"
    if re.search(r"\b(property|building|facility|premise|site)\b", m):
        return "property"
    if re.search(r"\b(stock|inventory|low.*stock|out.*stock|item)\b", m):
        return "stock"
    if re.search(r"\b(diesel|fuel|generator)\b", m):
        return "diesel"
    return "general"


def _time_window(message: str) -> tuple[str, str]:
    """Extract date range from message. Returns (start_iso, end_iso)."""
    m = message.lower()
    now = datetime.now()
    end = now.isoformat()

    if re.search(r"\b(last\s+quarter|q\d|quarterly)\b", m):
        # Go back 3 months
        start = (now - timedelta(days=90)).isoformat()
    elif re.search(r"\b(last\s+month|30\s*days|monthly)\b", m):
        start = (now - timedelta(days=30)).isoformat()
    elif re.search(r"\b(last\s+week|7\s*days|weekly)\b", m):
        start = (now - timedelta(days=7)).isoformat()
    elif re.search(r"\b(today|daily)\b", m):
        start = now.replace(hour=0, minute=0, second=0).isoformat()
    else:
        # Default: last 30 days
        start = (now - timedelta(days=30)).isoformat()

    return start, end


# ─── Table handlers ─────────────────────────────────────────────────────────

async def _handle_tickets(jwt: str, message: str) -> str:
    m = message.lower()
    params: dict = {"select": "id,ticket_number,title,status,priority,created_at,resolved_at", "order": "created_at.desc", "limit": "10"}

    if re.search(r"\b(critical|high)\b", m):
        params["priority"] = "in.(critical,high)"
    if re.search(r"\b(open|active|pending)\b", m):
        params["status"] = "in.(open,in_progress,assigned)"
    elif re.search(r"\b(resolved|closed|done)\b", m):
        params["status"] = "in.(resolved,closed)"

    data = await _supabase_get(jwt, "tickets", params)
    if not data:
        return "No tickets match your query."

    lines = [f"Found {len(data)} ticket(s):"]
    for t in data[:5]:
        prio = t.get("priority", "medium").upper()
        lines.append(f"• #{t.get('ticket_number', 'N/A')}: {t.get('title', 'Untitled')} [{t.get('status', 'unknown')}] (Priority: {prio})")
    return "\n".join(lines)


async def _handle_energy(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "electricity_readings", {"select": "final_units,created_at", "order": "created_at.desc", "limit": "1"})
    if not data:
        return "No electricity readings found."
    latest = data[0]
    return f"Latest electricity reading: {latest.get('final_units', 'N/A')} units (recorded {latest.get('created_at', 'recently')})."


async def _handle_diesel(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "diesel_readings", {"select": "current_fuel_level,created_at", "order": "created_at.desc", "limit": "1"})
    if not data:
        return "No diesel readings found."
    latest = data[0]
    return f"Current diesel level: {latest.get('current_fuel_level', 'N/A')} litres (recorded {latest.get('created_at', 'recently')})."


async def _handle_staff(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "property_memberships", {"select": "role,user_id,users(full_name)", "status": "eq.active", "limit": "20"})
    if not data:
        return "No active staff members found."
    names = [f"{u.get('users', {}).get('full_name', 'Unknown')} ({u.get('role', 'staff')})" for u in data[:10]]
    return f"Active staff ({len(data)} total):\n" + "\n".join(f"• {n}" for n in names)


async def _handle_checklist(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "sop_completions", {"select": "status,created_at", "limit": "20"})
    if not data:
        return "No checklist data available."
    completed = sum(1 for d in data if d.get("status") == "completed")
    return f"Checklist status: {completed}/{len(data)} items completed."


async def _handle_health(jwt: str, _message: str) -> str:
    result = await _supabase_rpc(jwt, "get_property_health_score", {})
    if result is None:
        return "Unable to fetch health score at the moment."
    score = result.get("score", "N/A") if isinstance(result, dict) else "N/A"
    return f"Current property health score: {score}/100."


async def _handle_visitors(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "visitor_logs", {"select": "name,host_name,check_in_time,purpose,status", "order": "check_in_time.desc", "limit": "5"})
    if not data:
        return "No recent visitor logs."
    lines = ["Recent visitors:"]
    for v in data:
        lines.append(f"• {v.get('name', 'Guest')} — {v.get('purpose', 'Visit')} (Host: {v.get('host_name', 'N/A')}, Status: {v.get('status', 'unknown')})")
    return "\n".join(lines)


async def _handle_stock(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "stock_items", {"select": "name,quantity,min_quantity", "limit": "50"})
    if not data:
        return "No stock items found."
    low = [s for s in data if s.get("quantity", 0) > 0 and s.get("quantity", 0) <= s.get("min_quantity", 0)]
    out = [s for s in data if s.get("quantity", 0) == 0]
    lines = [f"Stock overview ({len(data)} items total):"]
    if low:
        lines.append(f"⚠️ Low stock ({len(low)}): " + ", ".join(s.get("name", "?") for s in low[:5]))
    if out:
        lines.append(f"🚨 Out of stock ({len(out)}): " + ", ".join(s.get("name", "?") for s in out[:5]))
    if not low and not out:
        lines.append("✅ All items at healthy levels.")
    return "\n".join(lines)


async def _handle_property(jwt: str, _message: str) -> str:
    data = await _supabase_get(jwt, "properties", {"select": "name,address,code", "limit": "5"})
    if not data:
        return "No properties found."
    lines = ["Your properties:"]
    for p in data:
        lines.append(f"• {p.get('name', 'Unnamed')} — {p.get('address', 'No address')} (Code: {p.get('code', 'N/A')})")
    return "\n".join(lines)


# ─── REPORT ENGINE ──────────────────────────────────────────────────────────

async def _handle_reports(jwt: str, message: str) -> str:
    """
    Build a structured report by querying ALL relevant tables.
    No single 'reports' table exists — reports are computed.
    """
    start_iso, _end_iso = _time_window(message)

    # ── 1. Tickets ──────────────────────────────────────────────────────────
    tickets = await _supabase_get(
        jwt, "tickets",
        {"select": "status,priority,created_at,resolved_at,closed_at", "limit": "1000"}
    )
    total_tickets = len(tickets)
    open_tickets = sum(1 for t in tickets if t.get("status") in ("open", "in_progress", "assigned"))
    resolved_tickets = sum(1 for t in tickets if t.get("status") in ("resolved", "closed"))
    critical_tickets = sum(1 for t in tickets if t.get("priority") in ("critical", "urgent", "high"))

    # SLA compliance (30-day window)
    sla_hours = {"urgent": 4, "high": 24, "medium": 72, "low": 168}
    cutoff = (datetime.now() - timedelta(days=30)).isoformat()
    recent_tickets = [t for t in tickets if t.get("created_at", "") >= cutoff]
    compliant = 0
    for t in recent_tickets:
        deadline = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00")).timestamp() + (sla_hours.get(t.get("priority", "medium"), 72) * 3600)
        resolved = t.get("resolved_at") or t.get("closed_at")
        if resolved:
            resolved_ts = datetime.fromisoformat(resolved.replace("Z", "+00:00")).timestamp()
            if resolved_ts <= deadline:
                compliant += 1
    sla_pct = round((compliant / len(recent_tickets)) * 100) if recent_tickets else 100

    # Avg resolution time
    resolved_with_time = [t for t in tickets if t.get("resolved_at")]
    avg_hours = 0
    if resolved_with_time:
        total_ms = sum(
            (datetime.fromisoformat(t["resolved_at"].replace("Z", "+00:00")).timestamp()
             - datetime.fromisoformat(t["created_at"].replace("Z", "+00:00")).timestamp()) * 1000
            for t in resolved_with_time
        )
        avg_hours = round(total_ms / len(resolved_with_time) / 3600000)

    # ── 2. Visitors ─────────────────────────────────────────────────────────
    visitors = await _supabase_get(jwt, "visitor_logs", {"select": "status,check_in_time", "limit": "500"})
    total_visitors = len(visitors)
    checked_in = sum(1 for v in visitors if v.get("status") == "checked_in")

    # ── 3. Stock ────────────────────────────────────────────────────────────
    stock_items = await _supabase_get(jwt, "stock_items", {"select": "quantity,min_quantity", "limit": "500"})
    total_stock = len(stock_items)
    low_stock = sum(1 for s in stock_items if s.get("quantity", 0) > 0 and s.get("quantity", 0) <= s.get("min_quantity", 0))
    out_of_stock = sum(1 for s in stock_items if s.get("quantity", 0) == 0)

    # ── 4. Users ────────────────────────────────────────────────────────────
    users = await _supabase_get(jwt, "users", {"select": "is_active", "limit": "500"})
    total_users = len(users)
    active_users = sum(1 for u in users if u.get("is_active"))

    # ── 5. Properties ───────────────────────────────────────────────────────
    properties = await _supabase_get(jwt, "properties", {"select": "name", "limit": "50"})
    property_names = [p.get("name", "Property") for p in properties[:3]]

    # ── 6. Electricity ──────────────────────────────────────────────────────
    elec = await _supabase_get(jwt, "electricity_readings", {"select": "final_units,created_at", "order": "created_at.desc", "limit": "1"})
    latest_elec = f"{elec[0].get('final_units', 'N/A')} units" if elec else "N/A"

    # ── Build report ────────────────────────────────────────────────────────
    lines = [
        "📊 FACILITY MANAGEMENT REPORT",
        "",
        f"Properties: {', '.join(property_names) if property_names else 'N/A'}",
        "",
        "── TICKETS ──",
        f"• Total: {total_tickets}  |  Open: {open_tickets}  |  Resolved: {resolved_tickets}",
        f"• Critical/High: {critical_tickets}",
        f"• SLA Compliance (30d): {sla_pct}%",
        f"• Avg Resolution Time: {avg_hours} hours",
        "",
        "── VISITORS ──",
        f"• Total logs: {total_visitors}  |  Checked in: {checked_in}",
        "",
        "── STOCK ──",
        f"• Total items: {total_stock}  |  Low stock: {low_stock}  |  Out of stock: {out_of_stock}",
        "",
        "── USERS ──",
        f"• Total staff: {total_users}  |  Active: {active_users}",
        "",
        "── UTILITIES ──",
        f"• Latest electricity: {latest_elec}",
    ]

    return "\n".join(lines)


async def _handle_general(_jwt: str, _message: str) -> str:
    return (
        "I can help you with:\n"
        "• Tickets — open, critical, resolved\n"
        "• Energy & electricity readings\n"
        "• Diesel & generator levels\n"
        "• Staff & on-call roster\n"
        "• Stock & inventory levels\n"
        "• Checklist & SOP completion\n"
        "• Visitor logs\n"
        "• Property health scores\n"
        "• Reports & dashboards (last week/month/quarter)\n"
        "What would you like to know?"
    )


HANDLERS = {
    "tickets": _handle_tickets,
    "energy": _handle_energy,
    "diesel": _handle_diesel,
    "staff": _handle_staff,
    "reports": _handle_reports,
    "checklist": _handle_checklist,
    "health": _handle_health,
    "visitors": _handle_visitors,
    "stock": _handle_stock,
    "property": _handle_property,
    "general": _handle_general,
}


async def process_message(jwt: str, message: str) -> str:
    """Route message to the right handler and return a text response."""
    intent = _intent(message)
    handler = HANDLERS.get(intent, _handle_general)
    return await handler(jwt, message)


async def stream_response(jwt: str, message: str) -> AsyncGenerator[str, None]:
    """Process a message and yield SSE data chunks."""
    response = await process_message(jwt, message)
    # Stream word-by-word for a natural feel
    words = response.split()
    for word in words:
        yield f"data: {word}\n\n"
        await asyncio.sleep(0.03)
    yield "data: [DONE]\n\n"
