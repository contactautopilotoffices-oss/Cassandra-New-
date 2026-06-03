"""
SQL Engine — Natural Language to SQL + Execution (Supabase-backed)
=================================================================

Translates SQL into PostgREST API calls against the FMS Supabase project.
Handles COUNT, GROUP BY, ORDER BY, LIMIT by fetching data and aggregating
in Python when PostgREST cannot express the query natively.

Schema Reference: Uses fms_schema.py for column names and valid values.

Module: 4.1
Status: ACTIVE
Updated: 2026-06-01 (schema integration)
"""

from __future__ import annotations

import logging
import os
import re
from collections import defaultdict
from typing import Any, Optional

import httpx

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)
from cassandra.tools.sql_guard import SQLGuard, GuardResult
from cassandra.tools.fms_schema import (
    TABLES,
    VALID_STATUS,
    VALID_PRIORITY,
    COLUMN_ALIASES,
    RETIRED_STATUS,
    get_required_predicates,
    resolve_column,
)

# ---------------------------------------------------------------------------
# Supabase Config — FMS/Expo project (xvucakstcmtfoanmgcql)
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ.get("FMS_SUPABASE_URL", os.environ.get("EXPO_PUBLIC_SUPABASE_URL", ""))
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", ""),
)

logger = logging.getLogger("cassandra.tools.sql_engine")


def _supabase_headers(count: bool = False) -> dict[str, str]:
    h = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if count:
        h["Prefer"] = "count=exact"
    return h


# ---------------------------------------------------------------------------
# SQL Engine Tool
# ---------------------------------------------------------------------------

class SQLEngineTool(Tool):
    name = "sql_engine"
    description = (
        "Execute a SQL SELECT query against the FMS database.\n"
        "RULES:\n"
        "- Include organization_id = '<org_id>' AND property_id = '<property_id>' in every WHERE clause.\n"
        "- ALL tables defined in the schema are queryable (100+ tables including property_activities, "
        "  ppm_schedules, resolver_stats, mst_workload, skill_groups, shift_logs, budgets, etc.).\n"
        "- VALID ticket statuses: 'open', 'assigned', 'in_progress', 'resolved', 'closed', 'waitlist'.\n"
        "  (Do NOT use: 'satisfied', 'paused', 'pending_validation' — these don't exist)\n"
        "- VALID priority values: 'low', 'medium', 'high', 'urgent', 'critical'.\n"
        "- Column names: created_at (NOT created_date), raised_by (NOT created_by),\n"
        "  category_id (UUID FK, NOT category text), user_photo_url (NOT avatar_url).\n"
        "- For 'yesterday': created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE\n"
        "- Supports: COUNT(*), GROUP BY, ORDER BY, LIMIT, date range filters.\n"
        "Returns JSON array of rows, or {count: N} for COUNT queries."
    )

    def __init__(self):
        self._supabase_configured = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
        if not self._supabase_configured:
            logger.warning("[SQL_ENGINE] Supabase not configured")

    def execute(self, arguments: dict[str, Any], context: OrchestratorContext) -> ToolResult:
        call_id = f"sql_engine_{context.turn_count}"
        query: str = arguments.get("query", "").strip()

        if not query:
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error="MISSING_QUERY: 'query' argument is required")

        if not context.org_id:
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error="MISSING_ORG_ID: Cannot execute SQL without org context")

        # ── Substitute $N / :named parameters before guard+parse ────────────
        params: dict = arguments.get("params") or {}
        if params:
            query = self._substitute_params(query, params, context.org_id)

        # Also substitute {{org_id}} / {org_id} template placeholders
        query = query.replace("{{org_id}}", context.org_id).replace("{org_id}", context.org_id)

        # Also substitute {{property_id}} if present in context
        if context.property_id:
            query = query.replace("{{property_id}}", context.property_id)

        # ── Schema Validation: Check for wrong column names ─────────────────
        schema_check = self._validate_schema(query)
        if schema_check:
            logger.warning(f"[SQL_ENGINE] SCHEMA_ERROR: {schema_check}")
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error=f"SCHEMA_ERROR: {schema_check}")

        guard = SQLGuard(org_id=context.org_id)
        guard_result: GuardResult = guard.validate(query)
        if not guard_result.allowed:
            logger.warning(f"[SQL_ENGINE] GUARD_BLOCKED: {guard_result.reason}")
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error=f"SQL_GUARD_BLOCKED: {guard_result.reason}")

        if self._supabase_configured:
            return self._execute_supabase(query, context, call_id)
        return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                          error="Supabase not configured — set FMS_SUPABASE_URL and AUTH_SUPABASE_SERVICE_ROLE_KEY")

    # ------------------------------------------------------------------
    # Schema Validation
    # ------------------------------------------------------------------

    def _validate_schema(self, query: str) -> Optional[str]:
        """
        Validate that query uses correct column names from fms_schema.py.

        Returns error message if issues found, None if valid.
        """
        parsed = self._parse_sql(query)
        if not parsed:
            return None  # Let parse error handle this

        table = parsed["table"]
        if table not in TABLES:
            return None  # Guard will catch this

        valid_columns = set(TABLES[table]["columns"])
        issues = []

        # Check SELECT columns
        for col in parsed["select_cols"]:
            if col not in valid_columns:
                # Check if it's an alias for a valid column
                resolved = resolve_column(col)
                if resolved not in valid_columns:
                    issues.append(f"Unknown column '{col}' in table '{table}'. Valid: {sorted(valid_columns)}")

        # Check WHERE clause columns
        for col, op, val in parsed["filters"]:
            if col not in valid_columns:
                resolved = resolve_column(col)
                if resolved not in valid_columns:
                    issues.append(f"Unknown column '{col}' in WHERE clause. Valid: {sorted(valid_columns)}")

        # Check GROUP BY columns
        for col in parsed["group_by"]:
            if col not in valid_columns:
                resolved = resolve_column(col)
                if resolved not in valid_columns:
                    issues.append(f"Unknown column '{col}' in GROUP BY. Valid: {sorted(valid_columns)}")

        # Check status values if used
        for col, op, val in parsed["filters"]:
            if col == "status" and table in VALID_STATUS:
                # Strip quotes from val for status check
                clean_val = val.strip("'\" ")
                if clean_val in RETIRED_STATUS.get(table, []):
                    valid = VALID_STATUS[table]
                    issues.append(
                        f"Retired status '{clean_val}' not allowed. Valid: {valid}"
                    )

        if issues:
            return "; ".join(issues[:3])  # Limit to first 3 issues
        return None

    # ------------------------------------------------------------------
    # Core execution
    # ------------------------------------------------------------------

    def _execute_supabase(self, query: str, context: OrchestratorContext, call_id: str) -> ToolResult:
        try:
            p = self._parse_sql(query)
            if not p:
                return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                                  error=f"PARSE_ERROR: Could not parse query: {query[:120]}")

            table      = p["table"]
            filters    = p["filters"]       # list of (col, op, val)
            is_count   = p["is_count"]
            group_by   = p["group_by"]      # list of col names
            order_by   = p["order_by"]      # list of (col, "asc"|"desc")
            limit      = p["limit"]         # int or None
            sel_cols   = p["select_cols"]   # list of bare column names requested

            url = f"{SUPABASE_URL}/rest/v1/{table}"

            # ── Case 1: COUNT(*) with no GROUP BY ────────────────────────
            if is_count and not group_by:
                params = self._build_filter_params({"select": "id"}, filters)
                with httpx.Client(timeout=15.0) as client:
                    resp = client.get(url, headers=_supabase_headers(count=True), params=params)
                if not resp.is_success:
                    return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                                      error=f"SUPABASE_ERROR {resp.status_code}: {resp.text[:200]}")
                cr = resp.headers.get("content-range", "*/0")
                count = int(cr.split("/")[-1]) if "/" in cr else len(resp.json())
                logger.info(f"[SQL_ENGINE] COUNT={count} from {table} (org={context.org_id})")
                return ToolResult(call_id=call_id, tool_name=self.name, success=True,
                                  result={"data": [{"count": count}], "count": count,
                                          "table": table, "mode": "supabase_count"})

            # ── Case 2: GROUP BY (fetch + aggregate in Python) ───────────
            if group_by:
                fetch_cols = list({*group_by, *(c for c, _, _ in filters if c not in ("organization_id",))})
                # Always fetch the group_by columns + any aggregation columns
                if is_count:
                    fetch_cols = list(set(group_by + ["id"]))  # id for counting
                base = {"select": ",".join(fetch_cols) if fetch_cols else "*", "limit": "5000"}
                params = self._build_filter_params(base, filters)
                with httpx.Client(timeout=15.0) as client:
                    resp = client.get(url, headers=_supabase_headers(), params=params)
                if not resp.is_success:
                    return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                                      error=f"SUPABASE_ERROR {resp.status_code}: {resp.text[:200]}")
                rows = resp.json()

                # Aggregate
                buckets: dict[tuple, int] = defaultdict(int)
                for row in rows:
                    key = tuple(row.get(col) for col in group_by)
                    buckets[key] += 1

                agg_rows = [
                    {**dict(zip(group_by, k)), "count": v}
                    for k, v in buckets.items()
                ]

                # ORDER BY on the aggregated result
                for col, direction in reversed(order_by):
                    reverse = direction == "desc"
                    agg_rows.sort(key=lambda r: (r.get(col) or 0), reverse=reverse)

                if limit:
                    agg_rows = agg_rows[:limit]

                logger.info(f"[SQL_ENGINE] GROUP BY {group_by}: {len(agg_rows)} groups from {table}")
                return ToolResult(call_id=call_id, tool_name=self.name, success=True,
                                  result={"data": agg_rows, "count": len(agg_rows),
                                          "table": table, "mode": "supabase_aggregate"})

            # ── Case 3: Regular SELECT ────────────────────────────────────
            select_str = ",".join(sel_cols) if sel_cols else "*"
            base: dict[str, str] = {"select": select_str}
            # ORDER BY via PostgREST: order=col.asc,col2.desc
            if order_by:
                base["order"] = ",".join(f"{c}.{d}" for c, d in order_by)
            if limit:
                base["limit"] = str(limit)
            params = self._build_filter_params(base, filters)

            with httpx.Client(timeout=15.0) as client:
                resp = client.get(url, headers=_supabase_headers(), params=params)
            if not resp.is_success:
                return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                                  error=f"SUPABASE_ERROR {resp.status_code}: {resp.text[:200]}")

            data = resp.json()
            logger.info(f"[SQL_ENGINE] {len(data)} rows from {table} (org={context.org_id})")
            return ToolResult(call_id=call_id, tool_name=self.name, success=True,
                              result={"data": data, "count": len(data),
                                      "table": table, "mode": "supabase"})

        except Exception as exc:
            logger.error(f"[SQL_ENGINE] Error: {exc}", exc_info=True)
            return ToolResult(call_id=call_id, tool_name=self.name, success=False,
                              error=f"EXEC_ERROR: {type(exc).__name__}: {exc}")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_filter_params(self, base: dict, filters: list[tuple[str, str, str]]) -> list[tuple[str, str]]:
        """
        Convert parsed filters into a list of (key, value) tuples for httpx params.
        Using tuples (not dict) allows duplicate keys — needed for date range queries
        like created_at=gte.X&created_at=lt.Y on the same column.
        """
        op_map = {"=": "eq", "!=": "neq", "<>": "neq",
                  ">": "gt", ">=": "gte", "<": "lt", "<=": "lte"}
        result = list(base.items())  # Start with base params (select, limit, order, etc.)
        for col, op, val in filters:
            op_upper = op.upper()
            if op_upper == "IN":
                inner = val.strip("() ").replace("'", "").replace('"', "")
                result.append((col, f"in.({inner})"))
            elif op_upper == "LIKE":
                result.append((col, f"like.{val}"))
            elif op_upper == "ILIKE":
                result.append((col, f"ilike.{val}"))
            else:
                pg_op = op_map.get(op, "eq")
                result.append((col, f"{pg_op}.{val}"))
        return result

    def _apply_filters(self, params: dict, filters: list[tuple[str, str, str]]) -> None:
        """Translate parsed filter tuples into PostgREST query params (dict — no duplicate keys)."""
        op_map = {"=": "eq", "!=": "neq", "<>": "neq",
                  ">": "gt", ">=": "gte", "<": "lt", "<=": "lte"}
        for col, op, val in filters:
            op_upper = op.upper()
            if op_upper == "IN":
                # val like "('a','b')" → "a,b"
                inner = val.strip("() ").replace("'", "").replace('"', "")
                params[col] = f"in.({inner})"
            elif op_upper == "LIKE":
                params[col] = f"like.{val}"
            elif op_upper == "ILIKE":
                params[col] = f"ilike.{val}"
            else:
                pg_op = op_map.get(op, "eq")
                params[col] = f"{pg_op}.{val}"

    def _substitute_params(self, query: str, params: dict, org_id: str) -> str:
        """
        Replace $N (positional) and :name (named) placeholders with literal values.
        PostgREST does not support parameterized queries — values must be inlined.
        """
        # Build a unified lookup: both "1" and 1 → value
        lookup: dict[str, str] = {}
        for k, v in params.items():
            lookup[str(k)] = str(v)

        # Replace $1, $2 ... (positional, 1-based)
        def replace_positional(m: re.Match) -> str:
            n = m.group(1)
            val = lookup.get(n, m.group(0))
            # Quote strings if not already quoted and not a number/date
            if not re.match(r"^[\d.T:-]+$", val) and not val.startswith("'"):
                return f"'{val}'"
            return val

        query = re.sub(r"\$(\d+)", replace_positional, query)

        # Replace :name placeholders
        def replace_named(m: re.Match) -> str:
            name = m.group(1)
            if name in lookup:
                val = lookup[name]
                if not re.match(r"^[\d.T:-]+$", val) and not val.startswith("'"):
                    return f"'{val}'"
                return val
            return m.group(0)

        query = re.sub(r":([a-zA-Z_]\w*)", replace_named, query)
        return query

    def _parse_sql(self, sql: str) -> Optional[dict[str, Any]]:
        """
        Parse a SELECT statement into structured components.
        Handles: COUNT(*), GROUP BY, ORDER BY, LIMIT, date ranges.
        """
        sql = sql.strip().rstrip(";")
        up = sql.upper()

        if not up.startswith("SELECT"):
            return None

        # ── Table ────────────────────────────────────────────────────────
        from_m = re.search(r"\bFROM\s+(\w+)", up)
        if not from_m:
            return None
        table = from_m.group(1).lower()

        # ── Is it a COUNT query? ─────────────────────────────────────────
        # Matches: SELECT COUNT(*), SELECT count(*), SELECT COUNT(id)
        is_count = bool(re.search(r"SELECT\s+COUNT\s*\(", up))

        # ── SELECT columns (non-count) ───────────────────────────────────
        select_cols: list[str] = []
        if not is_count:
            sel_m = re.search(r"SELECT\s+(.+?)\s+FROM", sql, re.IGNORECASE | re.DOTALL)
            if sel_m:
                raw = sel_m.group(1).strip()
                if raw != "*":
                    # Pull bare column names, skip aliases and expressions
                    for part in raw.split(","):
                        part = part.strip()
                        col_m = re.match(r"^(\w+)(?:\s+AS\s+\w+)?$", part, re.IGNORECASE)
                        if col_m:
                            select_cols.append(col_m.group(1).lower())

        # ── WHERE clause ─────────────────────────────────────────────────
        where_raw = ""
        where_m = re.search(
            r"\bWHERE\b(.+?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bLIMIT\b|$)",
            sql, re.IGNORECASE | re.DOTALL,
        )
        if where_m:
            where_raw = where_m.group(1).strip()

        filters = self._parse_where(where_raw)

        # ── GROUP BY ─────────────────────────────────────────────────────
        group_by: list[str] = []
        gb_m = re.search(r"\bGROUP\s+BY\s+(.+?)(?:\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)",
                         sql, re.IGNORECASE | re.DOTALL)
        if gb_m:
            group_by = [c.strip().lower() for c in gb_m.group(1).split(",") if c.strip()]

        # ── ORDER BY ─────────────────────────────────────────────────────
        order_by: list[tuple[str, str]] = []
        ob_m = re.search(r"\bORDER\s+BY\s+(.+?)(?:\bLIMIT\b|$)",
                         sql, re.IGNORECASE | re.DOTALL)
        if ob_m:
            for part in ob_m.group(1).split(","):
                part = part.strip()
                # Skip aggregate expressions like COUNT(*) DESC
                if "(" in part:
                    # Extract direction only
                    dir_m = re.search(r"\b(ASC|DESC)\b", part, re.IGNORECASE)
                    direction = dir_m.group(1).lower() if dir_m else "asc"
                    # For GROUP BY + ORDER BY COUNT DESC, mark as count sort
                    order_by.append(("count", direction))
                else:
                    dir_m = re.search(r"\b(ASC|DESC)\b", part, re.IGNORECASE)
                    direction = dir_m.group(1).lower() if dir_m else "asc"
                    col_name = re.sub(r"\b(ASC|DESC)\b", "", part, flags=re.IGNORECASE).strip().lower()
                    if col_name:
                        order_by.append((col_name, direction))

        # ── LIMIT ────────────────────────────────────────────────────────
        limit: Optional[int] = None
        lim_m = re.search(r"\bLIMIT\s+(\d+)", sql, re.IGNORECASE)
        if lim_m:
            limit = int(lim_m.group(1))

        return {
            "table": table,
            "filters": filters,
            "is_count": is_count,
            "group_by": group_by,
            "order_by": order_by,
            "limit": limit,
            "select_cols": select_cols,
        }

    def _parse_where(self, where_clause: str) -> list[tuple[str, str, str]]:
        """Parse WHERE clause into list of (column, operator, value) tuples."""
        if not where_clause:
            return []

        filters = []
        # Split on AND (simple — no nested OR/parens handling)
        conditions = re.split(r"\bAND\b", where_clause, flags=re.IGNORECASE)

        for cond in conditions:
            cond = cond.strip()
            if not cond:
                continue

            # IN operator: col IN ('a', 'b')
            in_m = re.match(r"(\w+)\s+IN\s*(\(.+?\))", cond, re.IGNORECASE)
            if in_m:
                filters.append((in_m.group(1).lower(), "IN", in_m.group(2)))
                continue

            # LIKE / ILIKE
            like_m = re.match(r"(\w+)\s+(I?LIKE)\s+'([^']*)'", cond, re.IGNORECASE)
            if like_m:
                filters.append((like_m.group(1).lower(), like_m.group(2).upper(), like_m.group(3)))
                continue

            # Standard comparison: col OP value
            cmp_m = re.match(
                r"(\w+)\s*(>=|<=|<>|!=|>|<|=)\s*(['\"]?)([^'\"]*)\3",
                cond
            )
            if cmp_m:
                col = cmp_m.group(1).lower()
                op  = cmp_m.group(2)
                val = cmp_m.group(4).strip()
                # Strip trailing whitespace/quotes
                val = val.strip("'\" ")
                filters.append((col, op, val))

        return filters
