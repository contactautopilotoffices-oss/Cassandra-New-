"""
FK Graph Loader — Foreign Key Relationship Graph
=============================================

Provides subgraph retrieval for SQL Engine v2.
Loads verified FK relationships and helps LLM generate correct JOINs.

Usage:
    from cassandra.tools.fk_graph import FKGraph

    graph = FKGraph()

    # Get relevant relationships for a query
    subgraph = graph.get_subgraph(["electricity_readings", "properties"])

    # Validate a JOIN
    is_valid = graph.validate_join("tickets", "property_id", "properties", "id")

    # Get hint for joining two tables
    hint = graph.get_join_hint("electricity_readings", "properties")
    # → "Use electricity_readings.property_id = properties.id"

    # Resolve table alias
    table = graph.resolve_table("energy")
    # → "electricity_readings"
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

logger = logging.getLogger("cassandra.tools.fk_graph")


class FKGraph:
    """
    Foreign Key relationship graph for schema-aware SQL generation.

    Loads verified FK relationships from cassandra/config/fk_graph.json
    and provides methods for:
    - Subgraph retrieval (only relevant relationships)
    - JOIN validation (against verified FKs)
    - Table alias resolution
    - Column rename correction
    """

    def __init__(self, graph_path: str | None = None):
        if graph_path is None:
            # Try multiple paths
            possible_paths = [
                os.path.join(os.path.dirname(__file__), "..", "config", "fk_graph.json"),
                os.path.join(os.path.dirname(__file__), "..", "..", "config", "fk_graph.json"),
                "cassandra/config/fk_graph.json",
            ]
            for path in possible_paths:
                if os.path.exists(path):
                    graph_path = path
                    break

        if graph_path is None or not os.path.exists(graph_path):
            logger.warning(f"[FK_GRAPH] Graph file not found at {graph_path}, using empty graph")
            self.data = {"relationships": [], "table_aliases": {}, "text_to_uuid_columns": {}, "column_renames": {}}
            return

        with open(graph_path) as f:
            self.data = json.load(f)

        self.relationships = self.data.get("relationships", [])
        self.aliases = self.data.get("table_aliases", {})
        self.text_to_uuid = self.data.get("text_to_uuid_columns", {})
        self.column_renames = self.data.get("column_renames", {})
        self.common_queries = self.data.get("common_queries", {})

        logger.info(f"[FK_GRAPH] Loaded {len(self.relationships)} relationships from {graph_path}")

    # --------------------------------------------------------------------------
    # Subgraph Retrieval
    # --------------------------------------------------------------------------

    def get_subgraph(self, entities: list[str]) -> dict[str, Any]:
        """
        Get only FK relationships relevant to the query entities.

        Args:
            entities: List of table names (or aliases) detected in query

        Returns:
            Dict with:
            - relationships: List of relevant FK relationships
            - tables: All tables involved
            - hints: JOIN hints for common query patterns
        """
        resolved = [self.resolve_table(e) or e for e in entities]
        resolved = [r for r in resolved if r]  # Remove None

        relevant = []
        involved_tables = set()

        for rel in self.relationships:
            if rel["from"] in resolved or rel["to"] in resolved:
                relevant.append(rel)
                involved_tables.add(rel["from"])
                involved_tables.add(rel["to"])

        # Add hints for common query patterns
        hints = {}
        for query_name, query_info in self.common_queries.items():
            if any(t in resolved for t in query_info.get("requires_join", [])):
                hints[query_name] = query_info

        return {
            "relationships": relevant,
            "tables": list(involved_tables),
            "hints": hints,
        }

    def get_join_instructions(self, entities: list[str]) -> str:
        """
        Generate natural language JOIN instructions for the LLM.

        Args:
            entities: List of tables involved in the query

        Returns:
            String with JOIN instructions for the prompt
        """
        subgraph = self.get_subgraph(entities)

        if not subgraph["relationships"]:
            return ""

        lines = ["\nJOIN Instructions (use these exact FKs):"]

        for rel in subgraph["relationships"]:
            lines.append(
                f"  • To get {rel['to']}.* from {rel['from']}: "
                f"JOIN via {rel['from']}.{rel['from_col']} = {rel['to']}.{rel['to_col']}"
            )

        return "\n".join(lines)

    # --------------------------------------------------------------------------
    # Validation
    # --------------------------------------------------------------------------

    def validate_join(
        self,
        from_table: str,
        from_col: str,
        to_table: str,
        to_col: str,
    ) -> bool:
        """
        Validate if a JOIN is correct per verified FK graph.

        Args:
            from_table: Source table
            from_col: Source column (FK)
            to_table: Target table
            to_col: Target column (PK)

        Returns:
            True if JOIN is valid, False otherwise
        """
        # Normalize
        from_table = self.resolve_table(from_table) or from_table
        to_table = self.resolve_table(to_table) or to_table

        for rel in self.relationships:
            if (rel["from"] == from_table and rel["from_col"] == from_col and
                rel["to"] == to_table and rel["to_col"] == to_col):
                return True

            # Also check reverse direction
            if (rel["from"] == to_table and rel["from_col"] == to_col and
                rel["to"] == from_table and rel["to_col"] == from_col):
                return True

        return False

    def get_join_hint(self, from_table: str, to_table: str) -> Optional[str]:
        """
        Get the correct FK to use for joining two tables.

        Args:
            from_table: Source table
            to_table: Target table

        Returns:
            String with correct JOIN syntax, or None if no relationship exists
        """
        from_table = self.resolve_table(from_table) or from_table
        to_table = self.resolve_table(to_table) or to_table

        for rel in self.relationships:
            if rel["from"] == from_table and rel["to"] == to_table:
                return f"Use {rel['from']}.{rel['from_col']} = {rel['to']}.{rel['to_col']}"
            if rel["from"] == to_table and rel["to"] == from_table:
                return f"Use {rel['from']}.{rel['from_col']} = {rel['to']}.{rel['to_col']}"

        return None

    def get_column_hint(self, table: str, wrong_column: str) -> Optional[str]:
        """
        Get hint for correcting a column name.

        Args:
            table: Table name
            wrong_column: The incorrect column name used

        Returns:
            Correct column name, or None if no correction needed
        """
        key = f"{table}.{wrong_column}"
        if key in self.column_renames:
            return self.column_renames[key]
        return None

    # --------------------------------------------------------------------------
    # Resolution
    # --------------------------------------------------------------------------

    def resolve_table(self, text: str) -> Optional[str]:
        """
        Resolve a table alias to its canonical name.

        Args:
            text: Table name or alias

        Returns:
            Canonical table name, or None if not found
        """
        text_lower = text.lower().strip()

        # Direct match
        if text_lower in [t.lower() for t in self.aliases.keys()]:
            for table in self.aliases.keys():
                if table.lower() == text_lower:
                    return table

        # Alias match
        for table, aliases in self.aliases.items():
            if text_lower in [a.lower() for a in aliases]:
                return table

        return None

    def resolve_text_filter(self, text: str) -> Optional[dict]:
        """
        Resolve a text filter (like property_name) to table + column.

        Args:
            text: Text identifier like "property_name" or "user_email"

        Returns:
            Dict with table, col, filter_op, or None
        """
        text_lower = text.lower().strip()

        if text_lower in self.text_to_uuid:
            return self.text_to_uuid[text_lower]

        return None

    def get_columns_for_table(self, table: str) -> list[str]:
        """
        Get all known columns for a table (from relationships).

        Args:
            table: Table name

        Returns:
            List of column names
        """
        columns = set()

        for rel in self.relationships:
            if rel["from"] == table:
                columns.add(rel["from_col"])
            if rel["to"] == table:
                columns.add(rel["to_col"])

        return list(columns)

    # --------------------------------------------------------------------------
    # SQL Parsing Helpers
    # --------------------------------------------------------------------------

    def extract_joins_from_sql(self, sql: str) -> list[dict[str, str]]:
        """
        Extract JOIN clauses from a SQL query.

        Args:
            sql: SQL query string

        Returns:
            List of dicts with from_table, from_col, to_table, to_col
        """
        # Match patterns like: table1.col1 = table2.col2
        pattern = r'(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)'
        joins = []

        for match in re.finditer(pattern, sql, re.IGNORECASE):
            from_table, from_col, to_table, to_col = match.groups()
            joins.append({
                "from_table": from_table,
                "from_col": from_col,
                "to_table": to_table,
                "to_col": to_col,
            })

        return joins

    def validate_sql_joins(self, sql: str) -> tuple[bool, str]:
        """
        Validate all JOINs in a SQL query against FK graph.

        Args:
            sql: SQL query string

        Returns:
            Tuple of (is_valid, error_message)
        """
        joins = self.extract_joins_from_sql(sql)

        for join in joins:
            if not self.validate_join(
                join["from_table"],
                join["from_col"],
                join["to_table"],
                join["to_col"],
            ):
                hint = self.get_join_hint(join["from_table"], join["to_table"])
                error = f"INVALID_JOIN: {join['from_table']}.{join['from_col']} = {join['to_table']}.{join['to_col']}"
                if hint:
                    error += f"\nHint: {hint}"
                else:
                    error += f"\nNo FK relationship found between {join['from_table']} and {join['to_table']}"
                return False, error

        return True, ""

    def needs_join(self, sql: str) -> bool:
        """
        Check if a SQL query requires JOINs (multiple tables).

        Args:
            sql: SQL query string

        Returns:
            True if query has multiple tables, False otherwise
        """
        # Extract all table references
        from_pattern = r'FROM\s+(\w+)'
        join_pattern = r'JOIN\s+(\w+)'

        tables = re.findall(from_pattern, sql, re.IGNORECASE)
        tables.extend(re.findall(join_pattern, sql, re.IGNORECASE))

        return len(tables) > 1


# Singleton instance for reuse
_instance: Optional[FKGraph] = None


def get_fk_graph() -> FKGraph:
    """Get singleton FKGraph instance."""
    global _instance
    if _instance is None:
        _instance = FKGraph()
    return _instance
