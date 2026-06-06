"""
Validation Gate — Programmatic Checks Before Answer Reaches User
=================================================================

Deterministic Python checks, NOT prompt rules.

Blocks on provable contradictions only:
  1. Breakdown doesn't sum to stated total
  2. Answer cites a count but a tool failed (no grounded data)
  3. Answer claims a scope that doesn't match tool results

Fail-open on ambiguity: worst case = a bad answer slips through (status quo),
never = a good answer gets blocked (new regression).

Fix 3 enforcement layer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from cassandra.llm.scope_tag import ScopeTag


@dataclass
class ValidationResult:
    """Result of synthesis validation."""
    passed: bool
    reason: str = ""
    violation_type: str = ""  # "sum_mismatch", "scope_mismatch", "ungrounded_count"


def _extract_numbers(text: str) -> list[int]:
    """Extract all integers from text."""
    return [int(m) for m in re.findall(r'\b(\d+)\b', text)]


def _extract_total_and_breakdown(text: str) -> tuple[Optional[int], list[int]]:
    """
    Try to extract a stated total and individual breakdown numbers.

    Looks for patterns like:
      "Total tickets: 1476"
      "Breakdown: High: 31, Medium: 110, Low: 59"

    Returns (total_or_None, [breakdown_numbers])
    """
    total = None
    breakdown = []

    # Find "total" pattern — handles "Total tickets: 1476", "Total: 200", "in total 50"
    total_match = re.search(
        r'(?:total|altogether|in total)[\w\s]*?[:\s]+(\d+)',
        text,
        re.IGNORECASE,
    )
    if total_match:
        total = int(total_match.group(1))

    # Also check "X tickets" at start (e.g. "1476 tickets")
    if total is None:
        total_match2 = re.search(r'(\d+)\s+tickets', text, re.IGNORECASE)
        if total_match2:
            total = int(total_match2.group(1))

    # Find breakdown items (priority/status/category: N)
    breakdown_matches = re.findall(
        r'(?:high|medium|low|urgent|critical|open|closed|resolved|in.progress|assigned)[:\s]*(\d+)',
        text,
        re.IGNORECASE,
    )
    breakdown = [int(m) for m in breakdown_matches]

    return total, breakdown


def validate_synthesis(
    answer: str,
    tool_scopes: list[ScopeTag],
    user_intent_scope: Optional[ScopeTag] = None,
    had_tool_failure: bool = False,
) -> ValidationResult:
    """
    Validate a synthesized answer before it reaches the user.

    Checks:
    1. Sum consistency: if breakdown numbers don't add up to stated total
    2. Scope mismatch: answer claims a scope that tools didn't query
    3. Ungrounded count: tool failed but answer cites specific numbers

    Args:
        answer: The synthesized answer text
        tool_scopes: ScopeTags from the tool results that produced data
        user_intent_scope: What scope the user asked for (if detected)
        had_tool_failure: Whether any tool call failed

    Returns:
        ValidationResult — passed=True if no provable contradiction
    """
    # ── Check 1: Ungrounded count ─────────────────────────────────────────
    # If a tool failed but the answer cites specific numbers, block it.
    if had_tool_failure:
        numbers = _extract_numbers(answer)
        # Allow if answer has no significant numbers (just says "failed")
        significant_numbers = [n for n in numbers if n > 1]
        if significant_numbers:
            return ValidationResult(
                passed=False,
                reason=(
                    f"A tool query failed but the answer cites numbers "
                    f"({significant_numbers[:3]}). Cannot present ungrounded data."
                ),
                violation_type="ungrounded_count",
            )

    # ── Check 2: Sum consistency ──────────────────────────────────────────
    total, breakdown = _extract_total_and_breakdown(answer)
    if total is not None and len(breakdown) >= 2:
        breakdown_sum = sum(breakdown)
        # Allow 10% tolerance for "other" categories not listed
        if breakdown_sum > total:
            # Breakdown exceeds total — always wrong
            return ValidationResult(
                passed=False,
                reason=(
                    f"Sum mismatch: breakdown items sum to {breakdown_sum} "
                    f"but stated total is {total}. Breakdown cannot exceed total."
                ),
                violation_type="sum_mismatch",
            )
        if total > 0 and breakdown_sum < total * 0.5:
            # Breakdown is less than half the total — likely mixing scopes
            return ValidationResult(
                passed=False,
                reason=(
                    f"Sum mismatch: breakdown items sum to {breakdown_sum} "
                    f"but stated total is {total}. The breakdown accounts for "
                    f"only {breakdown_sum/total*100:.0f}% of the total — "
                    f"likely mixing results from different query scopes."
                ),
                violation_type="sum_mismatch",
            )

    # ── Check 3: Scope mismatch ───────────────────────────────────────────
    if user_intent_scope and tool_scopes:
        answer_lower = answer.lower()

        # Detect what scope the answer claims
        answer_claims_this_month = any(
            p in answer_lower for p in ["this month", "in june", "for june", "june 2026"]
        )
        answer_claims_temporal = answer_claims_this_month or any(
            p in answer_lower for p in ["last month", "today", "yesterday", "this week"]
        )

        # If answer claims temporal scope but all tools returned ALL_TIME
        if answer_claims_temporal and all(s == ScopeTag.ALL_TIME for s in tool_scopes):
            return ValidationResult(
                passed=False,
                reason=(
                    f"Scope mismatch: answer claims a time-scoped result but "
                    f"all tool queries were unfiltered (all_time). "
                    f"The numbers are likely from a different scope than claimed."
                ),
                violation_type="scope_mismatch",
            )

    return ValidationResult(passed=True)
