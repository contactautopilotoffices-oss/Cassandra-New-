"""
Date Range Materializer — Deterministic, No LLM Arithmetic
===========================================================

Computes resolved date ranges in Python and injects them into the system
prompt so the LLM copies literal bounds instead of computing them.

Uses calendar.monthrange for month-end (handles Feb/leap years correctly).

Fix 1: Additive — adds context lines, removes nothing.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta


def materialize_date_ranges(now: datetime) -> dict:
    """
    Compute all common date ranges from a reference datetime.

    Returns a dict with keys:
        today, yesterday, this_month, last_month, last_7_days, last_30_days, last_90_days

    Each range value is a dict with 'start', 'end', and 'label'.
    'today' and 'yesterday' are plain date strings.
    """
    today_str = now.strftime("%Y-%m-%d")

    yesterday = now - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")

    # This month: 1st to last day
    _, this_month_days = calendar.monthrange(now.year, now.month)
    this_month_start = f"{now.year}-{now.month:02d}-01"
    this_month_end = f"{now.year}-{now.month:02d}-{this_month_days:02d}"
    this_month_label = f"{calendar.month_name[now.month]} {now.year}"

    # Last month: handle January → December of previous year
    if now.month == 1:
        last_m_year = now.year - 1
        last_m_month = 12
    else:
        last_m_year = now.year
        last_m_month = now.month - 1

    _, last_month_days = calendar.monthrange(last_m_year, last_m_month)
    last_month_start = f"{last_m_year}-{last_m_month:02d}-01"
    last_month_end = f"{last_m_year}-{last_m_month:02d}-{last_month_days:02d}"
    last_month_label = f"{calendar.month_name[last_m_month]} {last_m_year}"

    # Relative ranges
    last_7_start = (now - timedelta(days=6)).strftime("%Y-%m-%d")
    last_30_start = (now - timedelta(days=29)).strftime("%Y-%m-%d")
    last_90_start = (now - timedelta(days=89)).strftime("%Y-%m-%d")

    return {
        "today": today_str,
        "yesterday": yesterday_str,
        "this_month": {
            "start": this_month_start,
            "end": this_month_end,
            "label": this_month_label,
        },
        "last_month": {
            "start": last_month_start,
            "end": last_month_end,
            "label": last_month_label,
        },
        "last_7_days": {
            "start": last_7_start,
            "end": today_str,
        },
        "last_30_days": {
            "start": last_30_start,
            "end": today_str,
        },
        "last_90_days": {
            "start": last_90_start,
            "end": today_str,
        },
    }


def format_date_context_block(now: datetime) -> str:
    """
    Format the resolved date ranges as a prompt block.

    The model is told to COPY these literals — no arithmetic.
    """
    r = materialize_date_ranges(now)

    # Next month start for < bound in SQL (exclusive upper bound)
    if now.month == 12:
        next_m_year = now.year + 1
        next_m_month = 1
    else:
        next_m_year = now.year
        next_m_month = now.month + 1
    next_month_start = f"{next_m_year}-{next_m_month:02d}-01"

    # Last month's first-of-this-month for < bound
    this_month_first = r["this_month"]["start"]

    return (
        "RESOLVED DATE RANGES (computed by server — copy these literal bounds, do NOT compute your own):\n"
        f"  today:        {r['today']}\n"
        f"  yesterday:    {r['yesterday']}\n"
        f"  this_month:   {r['this_month']['start']} .. {r['this_month']['end']}   ({r['this_month']['label']})\n"
        f"    SQL pattern: created_at >= '{r['this_month']['start']}T00:00:00' AND created_at < '{next_month_start}T00:00:00'\n"
        f"  last_month:   {r['last_month']['start']} .. {r['last_month']['end']}   ({r['last_month']['label']})\n"
        f"    SQL pattern: created_at >= '{r['last_month']['start']}T00:00:00' AND created_at < '{this_month_first}T00:00:00'\n"
        f"  last_7_days:  {r['last_7_days']['start']} .. {r['last_7_days']['end']}\n"
        f"  last_30_days: {r['last_30_days']['start']} .. {r['last_30_days']['end']}\n"
        f"  last_90_days: {r['last_90_days']['start']} .. {r['last_90_days']['end']}\n"
    )
