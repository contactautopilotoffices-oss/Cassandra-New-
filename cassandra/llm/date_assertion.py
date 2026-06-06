"""
Pre-Execution Date Assertion — Catch Wrong Date Bounds Before Query Runs
=========================================================================

Fires ONLY when:
  (a) User message contains a temporal phrase, AND
  (b) The tool is sql_query on a table with a timestamp column

Checks ONE thing: does the emitted SQL contain the resolved bound?

If the user said "this month" and the SQL has no >= '2026-06-01',
that is a provable contradiction → block and provide correction hint.

Fix 2: Only activates on temporal SQL. Cannot touch non-date queries.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


# Temporal phrases and which resolved range key they map to
TEMPORAL_PHRASES = {
    "this month": "this_month",
    "current month": "this_month",
    "last month": "last_month",
    "previous month": "last_month",
    "today": "today",
    "today's": "today",
    "yesterday": "yesterday",
    "last 7 days": "last_7_days",
    "past 7 days": "last_7_days",
    "last week": "last_7_days",
    "past week": "last_7_days",
    "last 30 days": "last_30_days",
    "past 30 days": "last_30_days",
    "last 90 days": "last_90_days",
    "past 90 days": "last_90_days",
}

# Month names map to this_month or last_month contextually
MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


@dataclass
class AssertionResult:
    """Result of a date assertion check."""
    passed: bool
    correction_hint: str = ""
    matched_phrase: str = ""
    expected_bound: str = ""


def _detect_temporal_intent(user_message: str) -> Optional[str]:
    """
    Detect which temporal phrase the user used.

    Returns the resolved range key (e.g. 'this_month') or None.
    """
    msg_lower = user_message.lower()

    # Check exact phrases first (longer phrases first to avoid partial matches)
    for phrase in sorted(TEMPORAL_PHRASES.keys(), key=len, reverse=True):
        if phrase in msg_lower:
            return TEMPORAL_PHRASES[phrase]

    # Check month names — map to the correct range
    for i, month in enumerate(MONTH_NAMES, 1):
        if month in msg_lower:
            # Will be validated against the actual SQL bound
            return f"month_{i}"

    return None


def assert_temporal_query(
    user_message: str,
    sql: str,
    resolved_ranges: dict,
) -> AssertionResult:
    """
    Assert that a temporal SQL query contains the correct resolved date bound.

    Args:
        user_message: The original user message
        sql: The SQL query about to be executed
        resolved_ranges: Output of materialize_date_ranges()

    Returns:
        AssertionResult — passed=True if no temporal contradiction found
    """
    intent = _detect_temporal_intent(user_message)
    if intent is None:
        # No temporal intent — always pass
        return AssertionResult(passed=True)

    # Resolve the expected bound
    if intent == "today":
        expected_start = resolved_ranges["today"]
        hint_label = "today"
    elif intent == "yesterday":
        expected_start = resolved_ranges["yesterday"]
        hint_label = "yesterday"
    elif intent in ("this_month", "last_month", "last_7_days", "last_30_days", "last_90_days"):
        range_data = resolved_ranges[intent]
        expected_start = range_data["start"]
        hint_label = intent.replace("_", " ")
    elif intent.startswith("month_"):
        # Specific month name — check if the SQL contains the correct month start
        month_num = int(intent.split("_")[1])
        expected_start = f"-{month_num:02d}-01"  # Partial match for any year
        hint_label = MONTH_NAMES[month_num - 1]
    else:
        return AssertionResult(passed=True)

    # Check if the SQL contains the expected bound
    sql_lower = sql.lower()

    # For full date bounds (e.g. "2026-06-01")
    if expected_start in sql:
        return AssertionResult(passed=True, matched_phrase=hint_label)

    # For partial bounds (month names → "-06-01")
    if expected_start.startswith("-") and expected_start in sql:
        return AssertionResult(passed=True, matched_phrase=hint_label)

    # Check if there's ANY date filter at all
    has_date_filter = bool(re.search(r"created_at\s*[><=]", sql_lower))

    if not has_date_filter:
        # No date filter but temporal intent present → contradiction
        return AssertionResult(
            passed=False,
            correction_hint=(
                f"User asked for '{hint_label}' but query has no date filter. "
                f"Add: created_at >= '{expected_start}T00:00:00'"
            ),
            matched_phrase=hint_label,
            expected_bound=expected_start,
        )

    # Has a date filter but wrong bound
    return AssertionResult(
        passed=False,
        correction_hint=(
            f"User asked for '{hint_label}' but SQL uses a different date bound. "
            f"Expected bound containing '{expected_start}'. "
            f"Use the resolved ranges from context."
        ),
        matched_phrase=hint_label,
        expected_bound=expected_start,
    )
