"""
Scope Tag — Tag Tool Results with Temporal Scope
==================================================

Each tool result gets a ScopeTag describing what time range it answered.
Synthesis can only cite a result whose scope matches the question.

Fix 3: Prevents a result from one scope (all_time=1476) being used
to answer a question about a different scope (this_month).
"""

from __future__ import annotations

import re
from enum import Enum


class ScopeTag(str, Enum):
    """Temporal scope of a tool result."""
    ALL_TIME = "all_time"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    TODAY = "today"
    YESTERDAY = "yesterday"
    CUSTOM_RANGE = "custom_range"
    UNKNOWN = "unknown"


# Patterns to detect date filters in SQL
_DATE_FILTER_RE = re.compile(
    r"created_at\s*>=\s*'(\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)


def detect_query_scope(sql: str, user_message: str) -> ScopeTag:
    """
    Detect the temporal scope of a SQL query.

    Args:
        sql: The SQL query string
        user_message: The original user message (for intent detection)

    Returns:
        ScopeTag indicating what time range the query covers
    """
    sql_lower = sql.lower()

    # Check if query has any date filter at all
    date_match = _DATE_FILTER_RE.search(sql)
    if not date_match:
        return ScopeTag.ALL_TIME

    # Has a date filter — classify it
    start_date = date_match.group(1)  # e.g. "2026-06-01"

    msg_lower = user_message.lower()

    # Match against known temporal phrases
    if any(p in msg_lower for p in ["this month", "current month"]):
        # Verify the SQL actually uses a first-of-month start
        if start_date.endswith("-01"):
            return ScopeTag.THIS_MONTH
        return ScopeTag.CUSTOM_RANGE

    if any(p in msg_lower for p in ["last month", "previous month"]):
        if start_date.endswith("-01"):
            return ScopeTag.LAST_MONTH
        return ScopeTag.CUSTOM_RANGE

    if any(p in msg_lower for p in ["today", "today's"]):
        return ScopeTag.TODAY

    if "yesterday" in msg_lower:
        return ScopeTag.YESTERDAY

    # Has a date filter but doesn't match a known phrase
    return ScopeTag.CUSTOM_RANGE
