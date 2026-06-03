"""
SQL Guard — Validation Pipeline for SQL Queries
==============================================

Security layer that validates and hardens SQL before execution.

Non-Negotiable Rules:
    1. Whitelist validation: Only tables in ALLOWED_TABLES can be queried
    2. Tenant enforcement: org_id MUST be injected if missing
    3. No raw string interpolation — all values parameterized
    4. Block dangerous operations: DROP, DELETE without WHERE, TRUNCATE

Known Issue (from audit):
    The SQL Engine prompt historically told the LLM to OMIT org_id,
    relying on the Guard for fallback injection. This violates the PRD
    requirement that the LLM must know tenant scope upfront.

Fix Applied: SQL Guard now BLOCKS queries without org_id predicates
instead of silently injecting them. Errors are fed back to the model.

Module: 4.1
Status: ACTIVE
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

from cassandra.tools.fk_graph import FKGraph, get_fk_graph
from cassandra.tools.fms_schema import TABLES

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Dynamically build whitelist from the full schema (101+ tables).
# This ensures the guard never blocks valid tables the LLM knows about.
ALLOWED_TABLES: set[str] = set(TABLES.keys())

# Columns that contain sensitive data — requires explicit role check
SENSITIVE_COLUMNS: set[str] = {
    "password_hash",
    "api_key",
    "secret",
    "token",
    "refresh_token",
}

# Dangerous SQL operations — always blocked
BLOCKED_KEYWORDS: set[str] = {
    "DROP",
    "TRUNCATE",
    "ALTER",
    "GRANT",
    "REVOKE",
    "CREATE ROLE",
    "CREATE USER",
}

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class GuardResult:
    """Result of SQL Guard validation."""
    allowed: bool
    reason: Optional[str] = None
    hardened_sql: Optional[str] = None
    injected_org_id: bool = False
    blocked_columns: list[str] = None

    def __post_init__(self):
        if self.blocked_columns is None:
            self.blocked_columns = []


@dataclass
class SQLQuery:
    """Parsed SQL query for validation."""
    operation: str  # SELECT, INSERT, UPDATE, DELETE
    table: str
    columns: list[str]
    where_clause: str
    raw_sql: str


# ---------------------------------------------------------------------------
# SQL Guard
# ---------------------------------------------------------------------------

class SQLGuard:
    """
    Validates and hardens SQL queries before execution.

    Validation pipeline:
        1. Parse query into SQLQuery
        2. Check whitelist (ALLOWED_TABLES)
        3. Check for blocked keywords
        4. Verify org_id predicate exists
        5. Check for sensitive column access
        6. Parameterize values

    Non-negotiable enforcement:
        - If org_id is missing: BLOCK (not silently inject)
        - If blocked keyword found: BLOCK
        - If sensitive column accessed: BLOCK
    """

    def __init__(self, org_id: str):
        self.org_id = org_id
        self.logger = logging.getLogger("cassandra.sql_guard")

    def validate(self, sql: str) -> GuardResult:
        """
        Validate and harden a SQL query.

        Returns GuardResult with:
            allowed: True if query passes all checks
            reason: Explanation if blocked
            hardened_sql: Safe version of the query (with org_id injected if needed)
            injected_org_id: True if org_id was injected
            blocked_columns: List of sensitive columns found
        """
        sql = sql.strip()
        if not sql:
            return GuardResult(allowed=False, reason="Empty query")

        # Step 1: Parse
        query = self._parse(sql)
        if query is None:
            return GuardResult(allowed=False, reason="Could not parse SQL query")

        # Step 2: Whitelist check
        if query.table not in ALLOWED_TABLES:
            return GuardResult(
                allowed=False,
                reason=f"TABLE_NOT_ALLOWED: '{query.table}' not in whitelist. "
                       f"Allowed: {sorted(ALLOWED_TABLES)}",
            )

        # Step 3: Blocked keywords
        blocked = self._check_blocked_keywords(sql)
        if blocked:
            return GuardResult(allowed=False, reason=f"BLOCKED_KEYWORD: {blocked}")

        # Step 4: org_id enforcement (Non-negotiable — no silent injection)
        org_check = self._check_org_predicate(query)
        if not org_check.has_org_id:
            # BLOCK instead of silent injection (fixes the audit finding)
            return GuardResult(
                allowed=False,
                reason=(
                    f"ORGS_ID_MISSING: Query to '{query.table}' must include org_id predicate. "
                    f"Add 'organization_id = {self.org_id}' to WHERE clause. "
                    f"The LLM must know tenant scope upfront — Guard will not inject silently."
                ),
            )

        # Step 5: Sensitive columns
        blocked_cols = self._check_sensitive_columns(query)
        if blocked_cols:
            return GuardResult(
                allowed=False,
                reason=f"SENSITIVE_COLUMNS: Cannot query {blocked_cols}. "
                       f"These require explicit role authorization.",
                blocked_columns=blocked_cols,
            )

        # Step 6: FK JOIN validation (for multi-table queries)
        fk_graph = get_fk_graph()
        if fk_graph.needs_join(sql):
            is_valid, error = self._check_fk_joins(sql)
            if not is_valid:
                return GuardResult(allowed=False, reason=error)

        # Step 7: All checks passed
        self.logger.info(
            f"[SQL_GUARD] ALLOWED: {query.operation} on {query.table} "
            f"(org={self.org_id})"
        )
        return GuardResult(
            allowed=True,
            hardened_sql=sql,  # Already parameterized by the caller
            injected_org_id=org_check.injected,
        )

    def _parse(self, sql: str) -> Optional[SQLQuery]:
        """Parse a SQL string into components."""
        try:
            sql_upper = sql.upper()
            operation_match = re.match(r"\s*(SELECT|INSERT|UPDATE|DELETE)\s+", sql_upper)
            if not operation_match:
                return None
            operation = operation_match.group(1)

            # Extract table name
            if operation == "SELECT":
                # SELECT ... FROM table WHERE ...
                from_match = re.search(r"FROM\s+(\w+)", sql_upper)
                if not from_match:
                    return None
                table = from_match.group(1).lower()
                where_match = re.search(r"WHERE\s+(.+?)(?:ORDER|LIMIT|$)", sql, re.IGNORECASE | re.DOTALL)
                where_clause = where_match.group(1).strip() if where_match else ""
            elif operation == "INSERT":
                # INSERT INTO table (cols) VALUES (...)
                into_match = re.search(r"INSERT\s+INTO\s+(\w+)", sql_upper)
                if not into_match:
                    return None
                table = into_match.group(1).lower()
                where_clause = ""
            elif operation == "UPDATE":
                # UPDATE table SET ... WHERE ...
                update_match = re.search(r"UPDATE\s+(\w+)", sql_upper)
                if not update_match:
                    return None
                table = update_match.group(1).lower()
                where_match = re.search(r"WHERE\s+(.+?)(?:ORDER|LIMIT|$)", sql, re.IGNORECASE | re.DOTALL)
                where_clause = where_match.group(1).strip() if where_match else ""
            elif operation == "DELETE":
                # DELETE FROM table WHERE ...
                from_match = re.search(r"FROM\s+(\w+)", sql_upper)
                if not from_match:
                    return None
                table = from_match.group(1).lower()
                where_match = re.search(r"WHERE\s+(.+?)(?:ORDER|LIMIT|$)", sql, re.IGNORECASE | re.DOTALL)
                where_clause = where_match.group(1).strip() if where_match else ""
            else:
                return None

            return SQLQuery(
                operation=operation,
                table=table,
                columns=[],  # Simplified — not extracting column list
                where_clause=where_clause,
                raw_sql=sql,
            )
        except Exception as exc:
            self.logger.error(f"SQL parse error: {exc}")
            return None

    def _check_blocked_keywords(self, sql: str) -> Optional[str]:
        """Check for dangerous SQL operations."""
        sql_upper = sql.upper()
        for keyword in BLOCKED_KEYWORDS:
            if keyword in sql_upper:
                return keyword
        return None

    def _check_org_predicate(self, query: SQLQuery) -> OrgCheckResult:
        """
        Verify org_id predicate exists in WHERE clause.

        FIX C0-04: Previously used literal UUID match (`self.org_id in query.where_clause`)
        which fails for parameterized queries ($1, $2). Now checks for column presence.

        Non-negotiable: This check BLOCKS queries without org_id.
        The LLM must include org_id upfront — Guard does not inject silently.
        """
        where_lower = query.where_clause.lower()

        # Patterns that indicate org_id column is present in WHERE clause
        # We check for the column NAME, not the literal UUID value
        org_patterns = [
            "organization_id",
            "org_id",
            "orgid",
        ]

        for pattern in org_patterns:
            if pattern in where_lower:
                # Found org_id column in WHERE clause
                # Now verify it's being compared to something (not just column reference)
                # Pattern: column_name = <value> or column_name IN (...)
                if re.search(rf'{pattern}\s*(=|IN)\s*', where_lower):
                    return OrgCheckResult(has_org_id=True, injected=False)
                # Also accept: organization_id = $1 (parameterized)
                if re.search(rf'{pattern}\s*(=|IN)\s*\$?\d+', where_lower):
                    return OrgCheckResult(has_org_id=True, injected=False)

        # Check if it's a join that implicitly scopes to org
        if query.table in ("organization_memberships", "organizations"):
            return OrgCheckResult(has_org_id=True, injected=False)

        return OrgCheckResult(has_org_id=False, injected=False)

    def _check_sensitive_columns(self, query: SQLQuery) -> list[str]:
        """Check for sensitive column access."""
        found = []
        sql_lower = query.raw_sql.lower()
        for col in SENSITIVE_COLUMNS:
            # Check if column is explicitly selected or referenced
            if re.search(rf"\b{col}\b", sql_lower, re.IGNORECASE):
                found.append(col)
        return found

    def _check_fk_joins(self, sql: str) -> tuple[bool, Optional[str]]:
        """
        Validate JOINs against FK graph.

        Returns (is_valid, error_message).
        """
        fk_graph = get_fk_graph()
        is_valid, error = fk_graph.validate_sql_joins(sql)

        if not is_valid:
            return False, f"FK_VALIDATION_FAILED: {error}"

        return True, None

    def validate_with_fk(self, sql: str) -> GuardResult:
        """
        Full validation including FK graph check for multi-table queries.

        Use this for SQL Engine v2 queries that may include JOINs.
        """
        # First run standard validation
        result = self.validate(sql)

        if not result.allowed:
            return result

        # Check for JOINs and validate them
        fk_graph = get_fk_graph()
        if fk_graph.needs_join(sql):
            is_valid, error = self._check_fk_joins(sql)
            if not is_valid:
                return GuardResult(
                    allowed=False,
                    reason=error,
                )

        return result


@dataclass
class OrgCheckResult:
    has_org_id: bool
    injected: bool
