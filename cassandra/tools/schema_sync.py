"""
Schema Sync — Auto-regenerate fms_schema.py from database.types.ts
=================================================================

Called at server startup. Parses the TypeScript types file and rebuilds
the Python schema module. Preserves rich metadata (notes, required_predicates)
for tables that already exist in fms_schema.py.

Module: 4.1
Status: ACTIVE
"""

from __future__ import annotations

import logging
import os
import re
from typing import Optional

logger = logging.getLogger("cassandra.schema_sync")


def _project_root() -> str:
    """Return the project root directory."""
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _parse_typescript_schema(ts_path: str) -> dict[str, list[str]]:
    """Parse database.types.ts and return {table_name: [columns]}."""
    with open(ts_path, "r") as f:
        content = f.read()

    tables: dict[str, list[str]] = {}
    # Match: table_name: {\n        Row: { ... }
    pattern = re.compile(
        r"([a-zA-Z_][a-zA-Z0-9_]*):\s*\{[\s\n]*Row:\s*\{([^}]+)\}",
        re.MULTILINE,
    )

    reserved = {"Database", "public", "Tables", "Functions", "Enums", "CompositeTypes"}

    for match in pattern.finditer(content):
        table_name = match.group(1)
        row_body = match.group(2)

        if table_name in reserved:
            continue

        columns: list[str] = []
        for line in row_body.split("\n"):
            line = line.strip()
            if ":" in line and not line.startswith("//"):
                col_name = line.split(":")[0].strip()
                if col_name and not col_name.startswith("["):
                    columns.append(col_name)

        if columns:
            tables[table_name] = columns

    return tables


def _load_existing_metadata(py_path: str) -> dict[str, dict]:
    """Load existing TABLES dict from fms_schema.py to preserve metadata."""
    if not os.path.exists(py_path):
        return {}

    try:
        with open(py_path, "r") as f:
            code = f.read()

        # Execute just the TABLES dict in a minimal namespace
        namespace: dict = {}
        exec(code, {"__name__": "cassandra.tools.fms_schema"}, namespace)
        return namespace.get("TABLES", {})
    except Exception as exc:
        logger.warning(f"[SCHEMA_SYNC] Could not parse existing fms_schema.py: {exc}")
        return {}


def _infer_required_predicates(table_name: str) -> list[str]:
    """Infer required WHERE predicates based on table name patterns."""
    # Tables that are clearly scoped to both org and property
    org_property = {
        "tickets", "ticket_comments", "properties", "visitor_logs",
        "electricity_readings", "diesel_readings", "stock_items", "stock_movements",
        "meeting_rooms", "meeting_room_bookings", "meeting_room_credits",
        "sop_templates", "sop_checklist_items", "sop_completions",
        "property_memberships", "ppm_schedules", "property_activities",
        "resolver_stats", "amc_contracts", "generators", "electricity_meters",
        "escalation_hierarchies", "escalation_levels", "skill_groups",
        "shift_logs", "mst_workload", "budgets", "dg_tariffs", "grid_tariffs",
        "invite_links", "invite_link_usage", "audit_logs", "export_logs",
        "feature_usage_logs", "feature_usage_summary", "issue_categories",
    }
    org_only = {
        "organizations", "organization_memberships", "companies",
        "company_members", "commission_cycles",
    }

    if table_name in org_property:
        return ["organization_id", "property_id"]
    if table_name in org_only:
        return ["organization_id"]
    # Default: assume org-scoped
    return ["organization_id"]


def _build_tables_block(
    ts_tables: dict[str, list[str]], existing_metadata: dict[str, dict]
) -> str:
    """Generate the TABLES = { ... } Python dict as a string."""
    lines = ["TABLES = {"]

    for name in sorted(ts_tables.keys()):
        columns = ts_tables[name]
        meta = existing_metadata.get(name, {})

        pk = meta.get("primary_key", "id" if "id" in columns else None)
        pred = meta.get("required_predicates", _infer_required_predicates(name))
        notes = meta.get("notes", f"{name} table.")

        lines.append(f'    "{name}": {{')
        lines.append(f'        "columns": {columns!r},')
        lines.append(f'        "primary_key": {pk!r},')
        lines.append(f'        "required_predicates": {pred!r},')
        lines.append(f'        "notes": {notes!r}')
        lines.append("    },")

    lines.append("}")
    return "\n".join(lines)


def _build_fms_schema_content(ts_tables: dict[str, list[str]], py_path: str) -> str:
    """Build the full fms_schema.py content."""
    existing_meta = _load_existing_metadata(py_path)
    tables_block = _build_tables_block(ts_tables, existing_meta)

    # Collect all tables that have a 'status' column
    tables_with_status = [n for n, cols in ts_tables.items() if "status" in cols]

    # Build VALID_STATUS dynamically from existing + inferred
    valid_status_entries = []
    retired_entries = []
    for name in sorted(tables_with_status):
        existing_valid = existing_meta.get(name, {}).get("valid_status", [])
        if existing_valid:
            valid_status_entries.append(f'    "{name}": {existing_valid!r},')
        # Default ticket statuses if table is tickets
        if name == "tickets":
            valid_status_entries.append(
                '    "tickets": ["open", "assigned", "in_progress", "resolved", "closed", "waitlist"],'
            )
            retired_entries.append('    "tickets": ["satisfied", "paused", "pending_validation"],')

    valid_status_block = (
        "\n".join(["VALID_STATUS = {"] + valid_status_entries + ["}"])
        if valid_status_entries
        else 'VALID_STATUS = {"tickets": ["open", "assigned", "in_progress", "resolved", "closed", "waitlist"]}'
    )

    retired_block = (
        "\n".join(["RETIRED_STATUS = {"] + retired_entries + ["}"])
        if retired_entries
        else 'RETIRED_STATUS = {"tickets": ["satisfied", "paused", "pending_validation"]}'
    )

    content = f'''"""
FMS Database Schema — Source of Truth for SQL Generation
=======================================================

This module is the authoritative schema reference for all SQL queries.
LLM agents MUST consult this file before generating any SQL.

AUTO-GENERATED from database.types.ts at server startup.
DO NOT edit table definitions manually — they will be overwritten.

Module: 4.1
Status: ACTIVE
Updated: 2026-06-01
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Table Definitions (auto-generated — do not edit)
# ---------------------------------------------------------------------------

{tables_block}

# ---------------------------------------------------------------------------
# Valid Values (auto-generated)
# ---------------------------------------------------------------------------

{valid_status_block}

VALID_PRIORITY = {{
    "tickets": ["low", "medium", "high", "urgent", "critical"],
}}

# ---------------------------------------------------------------------------
# Column Name Corrections (Mobile → Schema)
# ---------------------------------------------------------------------------

COLUMN_ALIASES = {{
    "created_date": "created_at",       # Timestamptz column
    "created_by": "raised_by",          # FK to users
    "avatar_url": "user_photo_url",     # User photo
    "comment": "comment",               # Correct column name for ticket_comments
    "content": "comment",              # Old name maps to 'comment'
}}

# Status values that DON'T exist (retired/deprecated)
{retired_block}

# ---------------------------------------------------------------------------
# Query Templates
# ---------------------------------------------------------------------------

QUERY_TEMPLATES = {{
    "yesterday_ticket_count": """
SELECT COUNT(*) as ticket_count
FROM tickets
WHERE organization_id = '{{{{org_id}}}}'
  AND property_id = '{{{{property_id}}}}'
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE;
""",

    "open_tickets_by_assignee": """
SELECT assigned_to, COUNT(*) as open_count
FROM tickets
WHERE organization_id = '{{{{org_id}}}}'
  AND property_id = '{{{{property_id}}}}'
  AND status = 'open'
GROUP BY assigned_to
ORDER BY open_count DESC
LIMIT 5;
""",

    "property_ticket_summary": """
SELECT
    status,
    COUNT(*) as count
FROM tickets
WHERE organization_id = '{{{{org_id}}}}'
  AND property_id = '{{{{property_id}}}}'
GROUP BY status
ORDER BY count DESC;
""",
}}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_valid_status(table: str) -> list[str]:
    """Return valid status values for a table."""
    return VALID_STATUS.get(table, [])

def get_valid_priority(table: str) -> list[str]:
    """Return valid priority values for a table."""
    return VALID_PRIORITY.get(table, [])

def get_required_predicates(table: str) -> list[str]:
    """Return required WHERE predicates for a table."""
    return TABLES.get(table, {{}}).get("required_predicates", [])

def get_table_columns(table: str) -> list[str]:
    """Return all columns for a table."""
    return TABLES.get(table, {{}}).get("columns", [])

def resolve_column(alias: str) -> str:
    """Resolve a column alias to the actual column name."""
    return COLUMN_ALIASES.get(alias, alias)
'''
    return content


def sync_schema() -> bool:
    """
    Synchronize fms_schema.py with database.types.ts.

    Returns True if the file was updated, False if no changes needed.
    """
    root = _project_root()
    ts_path = os.path.join(root, "saas_mobile_app", "types", "database.types.ts")
    py_path = os.path.join(root, "cassandra", "tools", "fms_schema.py")

    if not os.path.exists(ts_path):
        logger.warning(f"[SCHEMA_SYNC] database.types.ts not found at {ts_path} — skipping sync (using bundled fms_schema.py)")
        return False

    if not os.path.exists(py_path):
        logger.error(f"[SCHEMA_SYNC] fms_schema.py also missing at {py_path} — schema unavailable")
        return False

    try:
        ts_tables = _parse_typescript_schema(ts_path)
        if not ts_tables:
            logger.warning("[SCHEMA_SYNC] No tables found in database.types.ts")
            return False

        new_content = _build_fms_schema_content(ts_tables, py_path)

        # Only write if content changed
        if os.path.exists(py_path):
            with open(py_path, "r") as f:
                old_content = f.read()
            if old_content == new_content:
                logger.info(f"[SCHEMA_SYNC] fms_schema.py is up to date ({len(ts_tables)} tables)")
                return False

        with open(py_path, "w") as f:
            f.write(new_content)

        logger.info(
            f"[SCHEMA_SYNC] Updated fms_schema.py: {len(ts_tables)} tables from database.types.ts"
        )
        return True

    except Exception as exc:
        logger.error(f"[SCHEMA_SYNC] Failed to sync schema: {exc}", exc_info=True)
        return False


def get_table_count() -> int:
    """Return the number of tables currently in fms_schema.py."""
    py_path = os.path.join(_project_root(), "cassandra", "tools", "fms_schema.py")
    meta = _load_existing_metadata(py_path)
    return len(meta)
