"""
Calculate Date Tool — Deterministic Date Arithmetic
===================================================

Used to avoid LLM hallucinations during date arithmetic.
Calculates a future or past date based on a given reference date
and an offset.

Module: Tools
Status: ACTIVE
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
import calendar
from typing import Any

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

def add_months(sourcedate: datetime, months: int) -> datetime:
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return sourcedate.replace(year=year, month=month, day=day)

class CalculateDateTool(Tool):
    """
    Tool for calculating dates deterministically to prevent LLM hallucinations.
    """

    name = "calculate_date"
    description = (
        "Calculate a future or past date deterministically to prevent hallucinations. "
        "Use this whenever you need to compute relative dates like '10 days ago', "
        "'next month', 'in 3 weeks', etc. "
        "Provide a reference date (ISO format) and the amount to add or subtract."
    )

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        call_id = f"calculate_date_{getattr(context, 'turn_count', 0)}"

        reference_date_str = arguments.get("reference_date")
        if not reference_date_str:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_REFERENCE_DATE: 'reference_date' (ISO string) is required",
            )

        try:
            # Parse ISO string
            # Handle standard ISO strings like "2026-06-01T00:00:00" or "2026-06-01"
            if "T" in reference_date_str:
                ref_date = datetime.fromisoformat(reference_date_str.replace("Z", "+00:00"))
            else:
                ref_date = datetime.strptime(reference_date_str, "%Y-%m-%d")
        except Exception as e:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error=f"INVALID_DATE_FORMAT: {str(e)}",
            )

        offset_days = int(arguments.get("offset_days", 0))
        offset_weeks = int(arguments.get("offset_weeks", 0))
        offset_months = int(arguments.get("offset_months", 0))
        offset_years = int(arguments.get("offset_years", 0))

        result_date = ref_date

        if offset_years != 0:
            try:
                result_date = result_date.replace(year=result_date.year + offset_years)
            except ValueError:
                # Handle leap year (Feb 29 -> Feb 28)
                result_date = result_date.replace(year=result_date.year + offset_years, day=28)

        if offset_months != 0:
            result_date = add_months(result_date, offset_months)

        if offset_weeks != 0 or offset_days != 0:
            total_days = offset_days + (offset_weeks * 7)
            result_date = result_date + timedelta(days=total_days)

        logging.getLogger("cassandra.tools.calculate_date").info(
            f"[CALCULATE_DATE] {reference_date_str} + {offset_days}d/{offset_weeks}w/{offset_months}m/{offset_years}y -> {result_date.isoformat()}"
        )

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result={
                "calculated_date": result_date.isoformat(),
                "calculated_date_only": result_date.strftime("%Y-%m-%d"),
                "description": f"Successfully calculated date: {result_date.isoformat()}"
            },
        )
