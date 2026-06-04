"""
SQL Engine v2 — Schema-Aware with FK Graph and Python-Side JOIN
================================================================

Features:
- FK graph validation for JOINs
- Python-side JOIN for multi-table queries (PostgREST doesn't support JOINs)
- Intelligent query planning (single table vs multi-table)
- Aggregation support via Python computation
- Clarification on empty results

Usage:
    from cassandra.tools.sql_engine_v2 import SQLEngineV2

    engine = SQLEngineV2()
    result = engine.execute(
        query="SELECT * FROM electricity_readings JOIN properties ON ...",
        context={"org_id": "...", "property_id": "..."}
    )
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import re
import time
from typing import Any, Optional

import httpx

from cassandra.orchestrator import Tool, ToolResult, OrchestratorContext
from cassandra.tools.fk_graph import FKGraph, get_fk_graph
from cassandra.tools.fms_schema import TABLES, VALID_STATUS

logger = logging.getLogger("cassandra.tools.sql_engine_v2")


# Supabase config
SUPABASE_URL = os.environ.get(
    "FMS_SUPABASE_URL",
    os.environ.get("EXPO_PUBLIC_SUPABASE_URL", ""),
)
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", ""),
)


class SQLEngineV2:
    """
    SQL Engine v2 with FK-aware JOIN support.

    Execution path:
    1. Parse query for tables and JOINs
    2. If multi-table: fetch each table separately, JOIN in Python
    3. If single-table: execute via PostgREST
    4. Compute aggregations in Python (PostgREST GROUP BY is limited)
    """

    def __init__(self):
        self.fk_graph = get_fk_graph()
        self._http_client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._http_client = httpx.AsyncClient(timeout=30.0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._http_client:
            await self._http_client.aclose()

    def execute(self, query: str, context: dict[str, Any]) -> ToolResult:
        """
        Execute a query with FK-aware validation.
        Thread-safe sync wrapper — works whether or not an event loop is running.

        Args:
            query: SQL-like query string
            context: Execution context with org_id, property_id, etc.

        Returns:
            ToolResult with data or error
        """
        def _run():
            return asyncio.run(self.execute_async(query, context))

        try:
            # If we're already inside a running event loop (e.g. FastAPI), run in a
            # separate thread to avoid "cannot run nested event loop" error.
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(_run).result(timeout=60)
        except RuntimeError:
            # No running loop — safe to call asyncio.run directly
            return asyncio.run(self.execute_async(query, context))

    async def execute_async(self, query: str, context: dict[str, Any]) -> ToolResult:
        """
        Async execute with FK validation.
        """
        org_id = context.get("org_id", "")
        property_id = context.get("property_id", "")

        logger.info(f"[SQL_ENGINE_V2] Query: {query[:100]}...")

        # Step 1: Validate FK joins
        if self.fk_graph.needs_join(query):
            is_valid, error = self.fk_graph.validate_sql_joins(query)
            if not is_valid:
                logger.warning(f"[SQL_ENGINE_V2] FK validation failed: {error}")
                return ToolResult(
                    call_id=f"v2_fkfail_{time.time():.0f}",
                    tool_name="sql_query",
                    success=False,
                    error=error,
                )

        # Step 2: Extract entities and plan execution
        tables = self._extract_tables(query)
        needs_join = len(tables) > 1

        if needs_join:
            return await self._execute_with_join(query, context, tables)
        else:
            return await self._execute_single_table(query, context)

    def _extract_tables(self, sql: str) -> list[str]:
        """Extract table names from SQL query."""
        from_pattern = r'FROM\s+(\w+)'
        join_pattern = r'JOIN\s+(\w+)'

        tables = re.findall(from_pattern, sql, re.IGNORECASE)
        tables.extend(re.findall(join_pattern, sql, re.IGNORECASE))

        return list(set(tables)) if tables else []

    async def _execute_single_table(
        self, query: str, context: dict[str, Any]
    ) -> ToolResult:
        """
        Execute single-table query via PostgREST.
        """
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=30.0)

        # Parse the "SQL" into PostgREST parameters
        parsed = self._parse_query(query)
        table = parsed.get("table", "")

        # Build PostgREST URL
        url = f"{SUPABASE_URL}/rest/v1/{table}"

        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        }

        params: dict = {}

        # Always select all columns — aggregations computed Python-side
        params["select"] = "*"

        # Auto-inject organization_id scope (safety guard — never return cross-org data)
        org_id = context.get("org_id", "")
        if org_id:
            params["organization_id"] = f"eq.{org_id}"

        # Handle WHERE clause (date filters, status, property_id, etc.)
        where = parsed.get("where", "")
        if where:
            params.update(self._parse_where_to_params(where, context))

        # Handle LIMIT — cap at 500 to avoid OOM on large tables
        limit_match = re.search(r'LIMIT\s+(\d+)', query, re.IGNORECASE)
        if limit_match:
            params["limit"] = min(int(limit_match.group(1)), 500)
        else:
            params["limit"] = "500"

        try:
            resp = await self._http_client.get(url, headers=headers, params=params)
            if not resp.is_success:
                # Some tables don't have organization_id — retry without it
                if resp.status_code in (400, 404) and "organization_id" in params:
                    del params["organization_id"]
                    resp = await self._http_client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            # Compute aggregations in Python
            if "COUNT" in query.upper():
                data = self._compute_count(data, query)
            elif "SUM" in query.upper():
                data = self._compute_sum(data, query)
            elif "DISTINCT" in query.upper():
                # Count distinct vendor_ids, user_ids, etc.
                distinct_match = re.search(r'DISTINCT\s+(\w+)', query, re.IGNORECASE)
                if distinct_match:
                    col = distinct_match.group(1)
                    unique_vals = list({row.get(col) for row in data if row.get(col)})
                    data = [{"distinct_count": len(unique_vals), "column": col, "values": unique_vals[:50]}]

            return ToolResult(
                call_id=f"v2_single_{time.time():.0f}",
                tool_name="sql_query",
                success=True,
                result=data,
            )
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            logger.error(f"[SQL_ENGINE_V2] Request failed: {error_msg}")
            return ToolResult(
                call_id=f"v2_http_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=error_msg,
            )
        except Exception as e:
            logger.error(f"[SQL_ENGINE_V2] Error: {e}")
            return ToolResult(
                call_id=f"v2_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=str(e),
            )

    async def _execute_with_join(
        self,
        query: str,
        context: dict[str, Any],
        tables: list[str],
    ) -> ToolResult:
        """
        Execute multi-table query via Python-side JOIN.

        1. Extract the JOIN relationship from FK graph
        2. Fetch each table separately
        3. Join in Python using pandas-like merge
        """
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=60.0)

        org_id = context.get("org_id", "")
        property_id = context.get("property_id", "")

        # Find the JOIN column from FK graph
        join_hint = None
        for i, t1 in enumerate(tables):
            for t2 in tables[i+1:]:
                hint = self.fk_graph.get_join_hint(t1, t2)
                if hint:
                    join_hint = hint
                    break
            if join_hint:
                break

        if not join_hint:
            return ToolResult(
                call_id=f"v2_nofk_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=f"No FK relationship found between tables: {tables}. Cannot JOIN.",
            )

        # Parse join hint to get column names
        # Format: "Use table1.col1 = table2.col2"
        match = re.search(r'Use\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)', join_hint)
        if not match:
            return ToolResult(
                call_id=f"v2_parse_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=f"Could not parse join hint: {join_hint}",
            )

        left_table, left_col, right_table, right_col = match.groups()

        logger.info(f"[SQL_ENGINE_V2] JOIN: {left_table}.{left_col} = {right_table}.{right_col}")

        # Fetch both tables
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        }

        try:
            # Fetch left table
            left_url = f"{SUPABASE_URL}/rest/v1/{left_table}"
            left_params = {"select": "*", "limit": "1000"}

            # Add org filter if applicable
            if left_table in ["tickets", "properties", "mst_workload", "resolver_stats"]:
                left_params["organization_id"] = f"eq.{org_id}" if org_id else ""

            left_resp = await self._http_client.get(left_url, headers=headers, params=left_params)
            left_resp.raise_for_status()
            left_data = left_resp.json()

            # Fetch right table
            right_url = f"{SUPABASE_URL}/rest/v1/{right_table}"
            right_params = {"select": "*", "limit": "1000"}

            # Add org filter if applicable
            if right_table in ["tickets", "properties", "mst_workload", "resolver_stats"]:
                right_params["organization_id"] = f"eq.{org_id}" if org_id else ""

            right_resp = await self._http_client.get(right_url, headers=headers, params=right_params)
            right_resp.raise_for_status()
            right_data = right_resp.json()

            # Python-side JOIN
            joined = self._python_join(left_data, right_data, left_col, right_col)

            logger.info(f"[SQL_ENGINE_V2] JOIN result: {len(joined)} rows")

            return ToolResult(
                call_id=f"v2_join_{time.time():.0f}",
                tool_name="sql_query",
                success=True,
                result=joined,
            )

        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            return ToolResult(
                call_id=f"v2_join_http_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=error_msg,
            )
        except Exception as e:
            logger.error(f"[SQL_ENGINE_V2] JOIN error: {e}")
            return ToolResult(
                call_id=f"v2_join_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=str(e),
            )

    def _python_join(
        self,
        left: list[dict],
        right: list[dict],
        left_key: str,
        right_key: str,
    ) -> list[dict]:
        """
        Perform a simple JOIN in Python.

        Args:
            left: List of dicts from left table
            right: List of dicts from right table
            left_key: Column to join on from left table
            right_key: Column to join on from right table

        Returns:
            List of merged dicts
        """
        # Build lookup index for right table
        right_index: dict[str, dict] = {}
        for row in right:
            key_val = row.get(right_key)
            if key_val:
                right_index[str(key_val)] = row

        # Merge
        results = []
        for left_row in left:
            key_val = left_row.get(left_key)
            if key_val and str(key_val) in right_index:
                merged = {**left_row}
                # Add right table columns with prefix
                right_row = right_index[str(key_val)]
                for col, val in right_row.items():
                    if col not in merged:
                        merged[col] = val
                results.append(merged)
            else:
                # Include left row even if no match (left join behavior)
                results.append({**left_row})

        return results

    def _parse_query(self, sql: str) -> dict[str, Any]:
        """Parse simplified SQL into components."""
        result: dict[str, Any] = {}

        # Extract table
        table_match = re.search(r'FROM\s+(\w+)', sql, re.IGNORECASE)
        if table_match:
            result["table"] = table_match.group(1)

        # Extract WHERE
        where_match = re.search(r'WHERE\s+(.+?)(?:ORDER|LIMIT|$)', sql, re.IGNORECASE | re.DOTALL)
        if where_match:
            result["where"] = where_match.group(1).strip()

        return result

    def _parse_where_to_params(
        self, where: str, context: dict[str, Any]
    ) -> dict[str, str]:
        """Convert simplified WHERE clauses to PostgREST query params.

        Handles: property_id, organization_id, status, date columns, vendor_id, user_id.
        """
        from datetime import date, timedelta
        params: dict[str, str] = {}

        # property_id filter
        if "property_id" in where.lower():
            prop_id = context.get("property_id", "")
            if prop_id:
                params["property_id"] = f"eq.{prop_id}"

        # organization_id filter
        if "organization_id" in where.lower() or "org_id" in where.lower():
            org_id = context.get("org_id", "")
            if org_id:
                params["organization_id"] = f"eq.{org_id}"

        # status filter
        status_match = re.search(r"status\s*=\s*'([^']+)'", where, re.IGNORECASE)
        if status_match:
            params["status"] = f"eq.{status_match.group(1)}"

        # ── Date / time range filters ─────────────────────────────────────────
        # Detect which date column is referenced (revenue_date, entry_date, created_at, etc.)
        date_col_match = re.search(
            r'\b(revenue_date|entry_date|created_at|updated_at|planned_date|done_date|date)\b',
            where, re.IGNORECASE
        )
        date_col = date_col_match.group(1) if date_col_match else "created_at"

        today = date.today()

        # "CURRENT_DATE - INTERVAL '1 day'" / "yesterday" patterns
        if re.search(r"INTERVAL\s+['\"]1\s+day['\"]|yesterday", where, re.IGNORECASE):
            yesterday = (today - timedelta(days=1)).isoformat()
            params[date_col] = f"gte.{yesterday}T00:00:00"

        # "last N days" / "INTERVAL 'N days'"
        elif m := re.search(r"INTERVAL\s+['\"](\d+)\s+day", where, re.IGNORECASE):
            cutoff = (today - timedelta(days=int(m.group(1)))).isoformat()
            params[date_col] = f"gte.{cutoff}T00:00:00"

        # "this week"
        elif re.search(r"this\s+week", where, re.IGNORECASE):
            start_of_week = (today - timedelta(days=today.weekday())).isoformat()
            params[date_col] = f"gte.{start_of_week}T00:00:00"

        # "this month"
        elif re.search(r"this\s+month", where, re.IGNORECASE):
            start_of_month = today.replace(day=1).isoformat()
            params[date_col] = f"gte.{start_of_month}T00:00:00"

        # explicit ISO date  ">= '2026-05-01'"
        elif m := re.search(r">=\s*['\"](\d{4}-\d{2}-\d{2})['\"]", where):
            params[date_col] = f"gte.{m.group(1)}T00:00:00"

        return params

    def _compute_count(self, data: list[dict], query: str) -> list[dict]:
        """Compute COUNT from raw data (Python-side — PostgREST returns raw rows)."""
        group_match = re.search(r'GROUP\s+BY\s+(\w+)', query, re.IGNORECASE)
        if group_match:
            group_col = group_match.group(1)
            counts: dict[str, int] = {}
            for row in data:
                key = str(row.get(group_col, "unknown"))
                counts[key] = counts.get(key, 0) + 1
            return [{"group": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]
        else:
            return [{"total_count": len(data)}]

    def _compute_sum(self, data: list[dict], query: str) -> list[dict]:
        """Compute SUM(column) from raw data."""
        # Extract column being summed: SUM(revenue_amount) or SUM(total)
        m = re.search(r'SUM\s*\(\s*(\w+)\s*\)', query, re.IGNORECASE)
        if not m:
            return [{"sum": None, "note": "could not parse SUM column"}]
        col = m.group(1)
        group_match = re.search(r'GROUP\s+BY\s+(\w+)', query, re.IGNORECASE)
        if group_match:
            group_col = group_match.group(1)
            sums: dict[str, float] = {}
            for row in data:
                key = str(row.get(group_col, "unknown"))
                try:
                    sums[key] = sums.get(key, 0.0) + float(row.get(col, 0) or 0)
                except (TypeError, ValueError):
                    pass
            return [{"group": k, "sum": round(v, 2)} for k, v in sorted(sums.items(), key=lambda x: -x[1])]
        else:
            total = sum(float(row.get(col, 0) or 0) for row in data if row.get(col) is not None)
            return [{"total_sum": round(total, 2), "column": col, "row_count": len(data)}]

    def generate_join_query(
        self,
        left_table: str,
        right_table: str,
        context: dict[str, Any],
    ) -> Optional[str]:
        """
        Generate a valid JOIN query for two tables.

        Returns None if no FK relationship exists.
        """
        hint = self.fk_graph.get_join_hint(left_table, right_table)
        if not hint:
            return None

        org_id = context.get("org_id", "")
        property_id = context.get("property_id", "")

        # Parse hint
        match = re.search(r'Use\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)', hint)
        if not match:
            return None

        left_t, left_c, right_t, right_c = match.groups()

        # Build query
        query = f"""
SELECT *
FROM {left_t}
JOIN {right_t} ON {left_t}.{left_c} = {right_t}.{right_c}
WHERE {left_t}.organization_id = '{org_id}'
LIMIT 100
""".strip()

        return query


# Convenience function
def execute_sql(query: str, context: dict[str, Any]) -> ToolResult:
    """Execute a SQL query using SQL Engine v2."""
    engine = SQLEngineV2()
    return engine.execute(query, context)


# ---------------------------------------------------------------------------
# Tool Wrapper — matches cassandra.orchestrator.Tool interface
# ---------------------------------------------------------------------------

class SQLEngineV2Tool(Tool):
    """
    Tool adapter that wraps SQLEngineV2 for the LLM orchestrator.

    The orchestrator calls: tool.execute(arguments: dict, ctx: OrchestratorContext)
    This adapter bridges to SQLEngineV2's execute(query: str, context: dict).

    Features vs v1:
    - FK graph validation (fails fast on invalid JOINs)
    - Python-side JOIN for multi-table queries (PostgREST is single-table only)
    - Async execution with thread-safe sync wrapper
    """

    name = "sql_query"
    description = "Execute a SQL SELECT query against the FMS database with FK-aware JOIN support."

    def __init__(self):
        self._engine = SQLEngineV2()

    def execute(self, arguments: dict[str, Any], ctx: Any) -> ToolResult:
        """
        Execute the sql_query tool.

        Args:
            arguments: {"query": "SELECT ...", "params": {...}}  — params ignored (inline values)
            ctx: OrchestratorContext (or mock with .org_id, .user_id, .property_id, .role)

        Returns:
            ToolResult with data rows or error message
        """
        query = arguments.get("query", "").strip()
        if not query:
            return ToolResult(
                call_id=f"v2tool_noq_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error="No query provided to sql_query tool.",
            )

        # Build context dict from OrchestratorContext (or mock)
        context: dict[str, Any] = {
            "org_id": getattr(ctx, "org_id", ""),
            "user_id": getattr(ctx, "user_id", ""),
            "property_id": getattr(ctx, "property_id", ""),
            "role": getattr(ctx, "role", "tenant"),
        }

        logger.info(f"[SQLEngineV2Tool] Executing: {query[:120]}...")
        result = self._engine.execute(query, context)

        # Normalise call_id if somehow missing (defensive)
        if not getattr(result, "call_id", None):
            result.call_id = f"v2tool_{time.time():.0f}"

        return result
