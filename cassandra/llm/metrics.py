"""
Metrics — Lightweight In-Process Latency & Tool Telemetry
=========================================================

Records:
- Per-tool execution time (count, avg, p50, p95, max, failure rate)
- Per-turn end-to-end latency (perceive → respond)
- LLM call latency

Design principles:
- ZERO network calls in the hot path (pure in-memory, thread-safe)
- Structured log lines (one JSON object per event — greppable / parseable)
- Bounded memory (ring buffer of last N samples per metric)
- Exposed via /metrics endpoint for live observation

This intentionally does NOT write to Supabase llm_health_metrics on every call
(that would add a network round-trip + failure mode to every response). Instead
it aggregates in memory and emits a structured log line that an external collector
can scrape. A periodic flush to Supabase can be added later without touching the
hot path.

Module: Monitoring
Status: ACTIVE
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Optional

# Dedicated logger — emits one structured JSON line per event under "cassandra.metrics"
_metrics_logger = logging.getLogger("cassandra.metrics")


# Keep the last N samples per metric for percentile math. 512 is plenty for a demo
# and bounds memory at ~4KB per metric.
_RING_SIZE = 512


@dataclass
class _Stat:
    """Rolling statistics for a single named metric (e.g. one tool)."""
    name: str
    samples_ms: deque[float] = field(default_factory=lambda: deque(maxlen=_RING_SIZE))
    count: int = 0
    failures: int = 0
    total_ms: float = 0.0
    max_ms: float = 0.0

    def record(self, ms: float, success: bool) -> None:
        self.samples_ms.append(ms)
        self.count += 1
        self.total_ms += ms
        if ms > self.max_ms:
            self.max_ms = ms
        if not success:
            self.failures += 1

    def _percentile(self, pct: float) -> float:
        if not self.samples_ms:
            return 0.0
        ordered = sorted(self.samples_ms)
        idx = min(len(ordered) - 1, int(round((pct / 100.0) * (len(ordered) - 1))))
        return ordered[idx]

    def snapshot(self) -> dict[str, Any]:
        avg = (self.total_ms / self.count) if self.count else 0.0
        return {
            "name": self.name,
            "count": self.count,
            "failures": self.failures,
            "failure_rate": round(self.failures / self.count, 4) if self.count else 0.0,
            "avg_ms": round(avg, 1),
            "p50_ms": round(self._percentile(50), 1),
            "p95_ms": round(self._percentile(95), 1),
            "max_ms": round(self.max_ms, 1),
        }


class MetricsCollector:
    """
    Thread-safe in-process metrics collector.

    Usage:
        metrics.record_tool("sql_query", 145.3, success=True)
        metrics.record_turn(1820.5, tools_used=2, recovered=False)
        snapshot = metrics.snapshot()   # for /metrics endpoint
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tools: dict[str, _Stat] = {}
        self._turns = _Stat(name="turn_e2e")
        self._llm_calls = _Stat(name="llm_call")
        self._recoveries = 0            # how many turns triggered O→A retry
        self._empty_after_retry = 0     # retries that STILL came back empty
        self._started_at = time.time()

    # ----- recording (hot path — must be cheap) ----------------------------

    def record_tool(self, tool_name: str, ms: float, success: bool) -> None:
        with self._lock:
            stat = self._tools.get(tool_name)
            if stat is None:
                stat = _Stat(name=tool_name)
                self._tools[tool_name] = stat
            stat.record(ms, success)
        _emit("tool", {"tool": tool_name, "ms": round(ms, 1), "success": success})

    def record_llm_call(self, ms: float, success: bool = True) -> None:
        with self._lock:
            self._llm_calls.record(ms, success)
        _emit("llm_call", {"ms": round(ms, 1), "success": success})

    def record_turn(
        self,
        ms: float,
        tools_used: int = 0,
        recovered: bool = False,
        empty_after_retry: bool = False,
        success: bool = True,
    ) -> None:
        with self._lock:
            self._turns.record(ms, success)
            if recovered:
                self._recoveries += 1
            if empty_after_retry:
                self._empty_after_retry += 1
        _emit("turn", {
            "ms": round(ms, 1),
            "tools_used": tools_used,
            "recovered": recovered,
            "empty_after_retry": empty_after_retry,
            "success": success,
        })

    # ----- reporting (cold path — /metrics endpoint) -----------------------

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "uptime_s": round(time.time() - self._started_at, 1),
                "turn": self._turns.snapshot(),
                "llm_call": self._llm_calls.snapshot(),
                "tools": [self._tools[k].snapshot() for k in sorted(self._tools)],
                "recoveries": self._recoveries,
                "empty_after_retry": self._empty_after_retry,
            }

    def reset(self) -> None:
        with self._lock:
            self._tools.clear()
            self._turns = _Stat(name="turn_e2e")
            self._llm_calls = _Stat(name="llm_call")
            self._recoveries = 0
            self._empty_after_retry = 0
            self._started_at = time.time()


def _emit(event: str, fields: dict[str, Any]) -> None:
    """Emit one structured JSON log line. Safe — never raises into the hot path."""
    try:
        _metrics_logger.info(json.dumps({"metric": event, **fields}, default=str))
    except Exception:
        pass  # metrics must never break a response


# Module-level singleton — import this everywhere.
metrics = MetricsCollector()
