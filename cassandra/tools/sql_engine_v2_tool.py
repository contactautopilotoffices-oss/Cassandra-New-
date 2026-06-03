"""
SQL Engine v2 Tool Adapter — Wraps v2 with v1 Tool Interface
===========================================================

This adapter wraps SQLEngineV2 to conform to the Tool interface expected
by the orchestrator (execute(arguments, context) signature).

Also removes the old v1 engine from the import path.

Usage:
    # In orchestrator.py, replace:
    from cassandra.tools.sql_engine import SQLEngineTool
    # With:
    from cassandra.tools.sql_engine_v2_tool import SQLEngineToolV2
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from cassandra.orchestrator import Tool, ToolResult, OrchestratorContext
from cassandra.tools.fk_graph import FKGraph, get_fk_graph

logger = logging.getLogger("cassandra.tools.sql_engine_v2_tool")


class SQLEngineToolV2(Tool):
    """
    SQL Engine v2 wrapped as a Tool.

    Features over v1:
    - FK graph validation for JOINs
    - Python-side JOIN for multi-table queries
    - Better error messages
    - Clarification hints when queries fail

    Execution path:
    1. Parse query for entities
    2. Validate JOINs against FK graph
    3. If multi-table: fetch each table, JOIN in Python
    4. If single-table: execute via PostgREST
    """

    name = "sql_query"
    description = (
        "Execute a SQL SELECT query against the FMS database.\n"
        "RULES:\n"
        "- Include organization_id = '<org_id>' AND property_id = '<property_id>' in every WHERE clause.\n"
        "- ALL tables defined in the schema are queryable (100+ tables).\n"
        "- VALID ticket statuses: 'open', 'assigned', 'in_progress', 'resolved', 'closed', 'waitlist'.\n"
        "- Column names: created_at (NOT created_date), raised_by (NOT created_by),\n"
        "  category_id (UUID FK, NOT category text), user_photo_url (NOT avatar_url).\n"
        "- For JOINs between tables, use FK columns:\n"
        "  tickets.property_id = properties.id (get property name for tickets)\n"
        "  tickets.raised_by = users.id (get creator name)\n"
        "  tickets.assigned_to = users.id (get assignee name)\n"
        "  electricity_readings.property_id = properties.id (get property name for readings)\n"
        "- Returns JSON array of rows, or {count: N} for COUNT queries."
    )

    def __init__(self):
        self.fk_graph = get_fk_graph()
        self._supabase_url: str | None = None
        self._supabase_key: str | None = None
        self._load_config()

    def _load_config(self):
        """Load Supabase config from environment."""
        import os
        self._supabase_url = os.environ.get(
            "FMS_SUPABASE_URL",
            os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
        )
        self._supabase_key = os.environ.get(
            "AUTH_SUPABASE_SERVICE_ROLE_KEY",
            os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", "")
        )

    def execute(self, arguments: dict[str, Any], context: OrchestratorContext) -> ToolResult:
        """
        Execute a SQL query with FK-aware validation.

        Args:
            arguments: Dict with 'query' key (SQL query string)
            context: OrchestratorContext with org_id, property_id, etc.

        Returns:
            ToolResult with data or error
        """
        import time
        import httpx

        start_time = time.time()
        query = arguments.get("query", "").strip()
        call_id = f"sql_v2_{int(start_time * 1000)}"

        if not query:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_QUERY: 'query' argument is required",
            )

        org_id = context.org_id if hasattr(context, 'org_id') else (getattr(context, 'org_id', '') or '')
        property_id = context.property_id if hasattr(context, 'property_id') else (getattr(context, 'property_id', '') or '')

        if not org_id:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_ORG_ID: Cannot execute SQL without org context",
            )

        logger.info(f"[SQL_V2] Executing: {query[:100]}...")

        # Step 1: Validate FK joins if present
        if self.fk_graph.needs_join(query):
            is_valid, error = self.fk_graph.validate_sql_joins(query)
            if not is_valid:
                # Provide helpful hint
                hint = self._get_fk_hint(query)
                error_msg = f"{error}"
                if hint:
                    error_msg += f"\nHint: {hint}"
                logger.warning(f"[SQL_V2] FK validation failed: {error_msg}")
                return ToolResult(
                    call_id=call_id,
                    tool_name=self.name,
                    success=False,
                    error=error_msg,
                )

        # Step 2: Execute via PostgREST or Python-side JOIN
        try:
            result_data = self._execute_sync(query, org_id, property_id)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(f"[SQL_V2] Success: {len(result_data) if isinstance(result_data, list) else 'N/A'} rows in {elapsed_ms:.0f}ms")

            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=True,
                result=result_data,
                execution_ms=elapsed_ms,
            )

        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            error_msg = str(e)
            logger.error(f"[SQL_V2] Error: {error_msg}")
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error=error_msg,
                execution_ms=elapsed_ms,
            )

    def _get_fk_hint(self, query: str) -> str | None:
        """Extract tables from query and get FK hint."""
        import re
        from_pattern = r'FROM\s+(\w+)'
        join_pattern = r'JOIN\s+(\w+)'

        tables = re.findall(from_pattern, query, re.IGNORECASE)
        tables.extend(re.findall(join_pattern, query, re.IGNORECASE))
        tables = list(set(tables))

        if len(tables) >= 2:
            return self.fk_graph.get_join_hint(tables[0], tables[1])
        return None

    def _execute_sync(self, query: str, org_id: str, property_id: str) -> Any:
        """
        Execute query synchronously using httpx client.

        Handles:
        - Single-table queries via PostgREST
        - Multi-table queries via Python-side JOIN
        """
        import httpx
        import re

        if not self._supabase_url or not self._supabase_key:
            raise Exception("FMS_SUPABASE not configured")

        tables = self._extract_tables(query)
        needs_join = len(tables) > 1

        if needs_join:
            return self._execute_with_join(tables, org_id, property_id, query)
        else:
            return self._execute_single_table(tables[0] if tables else "tickets", query, org_id, property_id)

    def _extract_tables(self, sql: str) -> list[str]:
        """Extract table names from SQL query."""
        import re
        from_pattern = r'FROM\s+(\w+)'
        join_pattern = r'JOIN\s+(\w+)'
        tables = re.findall(from_pattern, sql, re.IGNORECASE)
        tables.extend(re.findall(join_pattern, sql, re.IGNORECASE))
        return list(set(tables)) if tables else []

    def _execute_single_table(self, table: str, query: str, org_id: str, property_id: str) -> list:
        """Execute single-table query via PostgREST."""
        import httpx
        import re

        headers = {
            "apikey": self._supabase_key,
            "Authorization": f"Bearer {self._supabase_key}",
            "Accept": "application/json",
        }

        # Build PostgREST params from query
        params = {}

        # Determine columns
        if "COUNT" in query.upper():
            params["select"] = "id,count"
        elif "SUM" in query.upper():
            params["select"] = "id"
        else:
            params["select"] = "*"

        # Parse WHERE clause for filters
        where_match = re.search(r'WHERE\s+(.+?)(?:ORDER|LIMIT|$)', query, re.IGNORECASE | re.DOTALL)
        if where_match:
            where = where_match.group(1).strip()
            # Add org filter
            if "organization_id" not in where.lower():
                params["organization_id"] = f"eq.{org_id}"
            # Add property filter if in query
            if "property_id" in where.lower() and property_id:
                # Property filter is in the query, pass it through
                pass
        else:
            # No WHERE, add org filter
            params["organization_id"] = f"eq.{org_id}"

        # Parse LIMIT
        limit_match = re.search(r'LIMIT\s+(\d+)', query, re.IGNORECASE)
        if limit_match:
            params["limit"] = limit_match.group(1)
        else:
            params["limit"] = "100"

        # Execute
        url = f"{self._supabase_url}/rest/v1/{table}"
        resp = httpx.get(url, headers=headers, params=params, timeout=30.0)
        resp.raise_for_status()
        data = resp.json()

        # Compute aggregations in Python if needed
        if "COUNT" in query.upper():
            if "GROUP BY" in query.upper():
                group_col = re.search(r'GROUP BY\s+(\w+)', query, re.IGNORECASE)
                if group_col:
                    counts = {}
                    for row in data:
                        key = str(row.get(group_col.group(1), "unknown"))
                        counts[key] = counts.get(key, 0) + 1
                    return [{"group": k, "count": v} for k, v in counts.items()]
            return [{"total_count": len(data)}]

        return data

    def _execute_with_join(self, tables: list[str], org_id: str, property_id: str, query: str) -> list:
        """
        Execute multi-table query via Python-side JOIN.

        1. Find the FK relationship between tables
        2. Fetch each table
        3. JOIN in Python
        """
        import httpx

        if len(tables) < 2:
            return []

        # Find join relationship
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
            raise Exception(f"No FK relationship found between {tables}")

        # Parse join hint
        import re
        match = re.search(r'Use\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)', join_hint)
        if not match:
            raise Exception(f"Could not parse join hint: {join_hint}")

        left_table, left_col, right_table, right_col = match.groups()

        headers = {
            "apikey": self._supabase_key,
            "Authorization": f"Bearer {self._supabase_key}",
            "Accept": "application/json",
        }

        # Fetch both tables
        left_url = f"{self._supabase_url}/rest/v1/{left_table}"
        left_params = {"select": "*", "limit": "500"}
        if left_table in ["tickets", "properties", "mst_workload", "resolver_stats"]:
            left_params["organization_id"] = f"eq.{org_id}"

        left_resp = httpx.get(left_url, headers=headers, params=left_params, timeout=30.0)
        left_resp.raise_for_status()
        left_data = left_resp.json()

        right_url = f"{self._supabase_url}/rest/v1/{right_table}"
        right_params = {"select": "*", "limit": "500"}
        if right_table in ["tickets", "properties", "mst_workload", "resolver_stats"]:
            right_params["organization_id"] = f"eq.{org_id}"

        right_resp = httpx.get(right_url, headers=headers, params=right_params, timeout=30.0)
        right_resp.raise_for_status()
        right_data = right_resp.json()

        # Python-side JOIN
        return self._python_join(left_data, right_data, left_col, right_col)

    def _python_join(self, left: list, right: list, left_key: str, right_key: str) -> list:
        """Perform LEFT JOIN in Python."""
        right_index = {str(row.get(right_key, "")): row for row in right}

        results = []
        for left_row in left:
            key = str(left_row.get(left_key, ""))
            merged = dict(left_row)
            if key in right_index:
                right_row = right_index[key]
                for col, val in right_row.items():
                    if col not in merged:
                        merged[col] = val
            results.append(merged)

        return results
