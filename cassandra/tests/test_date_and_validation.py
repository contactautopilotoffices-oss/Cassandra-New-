"""
Characterization & Regression Tests — Date Resolution + Validation Gate
========================================================================

These tests lock the behavior of:
1. Date range materialization (deterministic, no LLM arithmetic)
2. Scope tagging on tool results
3. Pre-execution date assertion (temporal SQL must contain resolved bounds)
4. Synthesis validation (sum consistency, scope mismatch detection)

Run: python3 -m pytest cassandra/tests/test_date_and_validation.py -v
  or: python3 -m cassandra.tests.test_date_and_validation
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from datetime import datetime, date
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# ---------------------------------------------------------------------------
# Test: Date Range Materializer (Fix 1)
# ---------------------------------------------------------------------------

from cassandra.llm.date_ranges import materialize_date_ranges


class TestDateRangeMaterializer(unittest.TestCase):
    """Lock: date ranges are computed deterministically in Python, not by the LLM."""

    def test_june_2026_this_month(self):
        """June has 30 days, not 31. The range must be correct."""
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        self.assertEqual(ranges["this_month"]["start"], "2026-06-01")
        self.assertEqual(ranges["this_month"]["end"], "2026-06-30")
        self.assertEqual(ranges["this_month"]["label"], "June 2026")

    def test_february_leap_year(self):
        """Feb 2028 is a leap year — 29 days."""
        ranges = materialize_date_ranges(datetime(2028, 2, 15, 10, 0, 0))
        self.assertEqual(ranges["this_month"]["start"], "2028-02-01")
        self.assertEqual(ranges["this_month"]["end"], "2028-02-29")

    def test_february_non_leap(self):
        """Feb 2027 is not a leap year — 28 days."""
        ranges = materialize_date_ranges(datetime(2027, 2, 10, 10, 0, 0))
        self.assertEqual(ranges["this_month"]["start"], "2027-02-01")
        self.assertEqual(ranges["this_month"]["end"], "2027-02-28")

    def test_december_last_month_is_november(self):
        """In December, last_month = November."""
        ranges = materialize_date_ranges(datetime(2026, 12, 15, 10, 0, 0))
        self.assertEqual(ranges["last_month"]["start"], "2026-11-01")
        self.assertEqual(ranges["last_month"]["end"], "2026-11-30")
        self.assertEqual(ranges["last_month"]["label"], "November 2026")

    def test_january_last_month_is_december_previous_year(self):
        """In January, last_month = December of previous year."""
        ranges = materialize_date_ranges(datetime(2027, 1, 5, 10, 0, 0))
        self.assertEqual(ranges["last_month"]["start"], "2026-12-01")
        self.assertEqual(ranges["last_month"]["end"], "2026-12-31")
        self.assertEqual(ranges["last_month"]["label"], "December 2026")

    def test_today_is_exact(self):
        """today must be the exact date, not a range."""
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        self.assertEqual(ranges["today"], "2026-06-06")

    def test_last_7_days_span(self):
        """last_7_days start is 6 days before today (inclusive range = 7 days)."""
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        self.assertEqual(ranges["last_7_days"]["start"], "2026-05-31")
        self.assertEqual(ranges["last_7_days"]["end"], "2026-06-06")

    def test_last_30_days_span(self):
        """last_30_days start is 29 days before today."""
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        self.assertEqual(ranges["last_30_days"]["start"], "2026-05-08")
        self.assertEqual(ranges["last_30_days"]["end"], "2026-06-06")

    def test_context_block_contains_all_ranges(self):
        """The formatted context block must include all range keys."""
        from cassandra.llm.date_ranges import format_date_context_block
        block = format_date_context_block(datetime(2026, 6, 6, 14, 30, 0))
        self.assertIn("this_month", block)
        self.assertIn("last_month", block)
        self.assertIn("last_7_days", block)
        self.assertIn("last_30_days", block)
        self.assertIn("today", block)
        self.assertIn("2026-06-01", block)
        self.assertIn("2026-06-30", block)


# ---------------------------------------------------------------------------
# Test: Scope Tagging (Fix 3)
# ---------------------------------------------------------------------------

from cassandra.llm.scope_tag import detect_query_scope, ScopeTag


class TestScopeTagging(unittest.TestCase):
    """Lock: tool results are tagged with the temporal scope they answered."""

    def test_unfiltered_query_is_all_time(self):
        sql = "SELECT COUNT(*) FROM tickets WHERE organization_id = 'abc'"
        tag = detect_query_scope(sql, "how many tickets total")
        self.assertEqual(tag, ScopeTag.ALL_TIME)

    def test_this_month_filter_tagged(self):
        sql = "SELECT COUNT(*) FROM tickets WHERE organization_id = 'abc' AND created_at >= '2026-06-01T00:00:00' AND created_at < '2026-07-01T00:00:00'"
        tag = detect_query_scope(sql, "tickets this month")
        self.assertEqual(tag, ScopeTag.THIS_MONTH)

    def test_last_month_filter_tagged(self):
        sql = "SELECT COUNT(*) FROM tickets WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'"
        tag = detect_query_scope(sql, "tickets last month")
        self.assertEqual(tag, ScopeTag.LAST_MONTH)

    def test_date_range_is_custom(self):
        sql = "SELECT * FROM tickets WHERE created_at >= '2026-03-01' AND created_at < '2026-04-01'"
        tag = detect_query_scope(sql, "march tickets")
        self.assertEqual(tag, ScopeTag.CUSTOM_RANGE)

    def test_relative_days_is_custom(self):
        sql = "SELECT * FROM tickets WHERE created_at >= '2026-05-30'"
        tag = detect_query_scope(sql, "last 7 days")
        self.assertEqual(tag, ScopeTag.CUSTOM_RANGE)


# ---------------------------------------------------------------------------
# Test: Pre-Execution Date Assertion (Fix 2)
# ---------------------------------------------------------------------------

from cassandra.llm.date_assertion import assert_temporal_query


class TestDateAssertion(unittest.TestCase):
    """Lock: temporal queries must contain the resolved date bound."""

    def test_this_month_query_with_correct_bound_passes(self):
        """A June query with >= '2026-06-01' should pass."""
        sql = "SELECT COUNT(*) FROM tickets WHERE organization_id='abc' AND created_at >= '2026-06-01T00:00:00' AND created_at < '2026-07-01T00:00:00'"
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        result = assert_temporal_query("tickets this month", sql, ranges)
        self.assertTrue(result.passed)

    def test_this_month_query_missing_bound_fails(self):
        """A 'this month' query without any June date bound must fail."""
        sql = "SELECT COUNT(*) FROM tickets WHERE organization_id='abc'"
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        result = assert_temporal_query("tickets this month", sql, ranges)
        self.assertFalse(result.passed)
        self.assertIn("2026-06-01", result.correction_hint)

    def test_non_temporal_query_always_passes(self):
        """A query with no temporal intent should always pass."""
        sql = "SELECT COUNT(*) FROM tickets WHERE organization_id='abc'"
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        result = assert_temporal_query("how many tickets total", sql, ranges)
        self.assertTrue(result.passed)

    def test_last_month_query_with_wrong_bound_fails(self):
        """Asking for 'last month' but SQL has this month's dates."""
        sql = "SELECT COUNT(*) FROM tickets WHERE created_at >= '2026-06-01'"
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        result = assert_temporal_query("tickets from last month", sql, ranges)
        self.assertFalse(result.passed)

    def test_yesterday_query_passes_with_correct_date(self):
        sql = "SELECT * FROM tickets WHERE created_at >= '2026-06-05T00:00:00' AND created_at < '2026-06-06T00:00:00'"
        ranges = materialize_date_ranges(datetime(2026, 6, 6, 14, 30, 0))
        result = assert_temporal_query("tickets from yesterday", sql, ranges)
        self.assertTrue(result.passed)


# ---------------------------------------------------------------------------
# Test: Synthesis Validation — Sum Consistency (Fix 3 enforcement)
# ---------------------------------------------------------------------------

from cassandra.llm.validation_gate import validate_synthesis, ScopeTag


class TestSynthesisValidation(unittest.TestCase):
    """Lock: answers with provable contradictions are blocked before reaching user."""

    def test_consistent_breakdown_passes(self):
        """High 31 + Medium 110 + Low 59 = 200 total → pass."""
        answer = "Total tickets: 200. Breakdown by priority: High: 31, Medium: 110, Low: 59."
        result = validate_synthesis(answer, tool_scopes=[ScopeTag.THIS_MONTH])
        self.assertTrue(result.passed)

    def test_inconsistent_breakdown_fails(self):
        """High 31 + Medium 110 + Low 59 = 200, but claims total 1476 → fail."""
        answer = "Total tickets: 1476. Breakdown by priority: Medium: 110, Low: 59, High: 31."
        result = validate_synthesis(answer, tool_scopes=[ScopeTag.THIS_MONTH])
        self.assertFalse(result.passed)
        self.assertIn("sum", result.reason.lower())

    def test_scope_mismatch_fails(self):
        """Answer says 'this month' but tool scope is ALL_TIME → fail."""
        answer = "This month you have 1476 tickets."
        result = validate_synthesis(
            answer,
            tool_scopes=[ScopeTag.ALL_TIME],
            user_intent_scope=ScopeTag.THIS_MONTH,
        )
        self.assertFalse(result.passed)
        self.assertIn("scope", result.reason.lower())

    def test_failed_tool_with_count_fails(self):
        """If a tool failed but the answer cites a number → fail."""
        answer = "Total tickets: 1476."
        result = validate_synthesis(
            answer,
            tool_scopes=[ScopeTag.THIS_MONTH],
            had_tool_failure=True,
        )
        self.assertFalse(result.passed)

    def test_no_numbers_with_failure_passes(self):
        """If a tool failed and answer says so honestly → pass."""
        answer = "The query for June tickets failed. Please try again."
        result = validate_synthesis(
            answer,
            tool_scopes=[ScopeTag.THIS_MONTH],
            had_tool_failure=True,
        )
        self.assertTrue(result.passed)

    def test_answer_without_numbers_passes(self):
        """Plain text answer with no numeric claims passes trivially."""
        answer = "I can help you with ticket management, property info, and reports."
        result = validate_synthesis(answer, tool_scopes=[])
        self.assertTrue(result.passed)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main()
