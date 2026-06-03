"""
Query Queue Package — Background Worker for LLM Load Management
============================================================

Problem: Continuous queries burn through LLM tokens and increase hallucination risk.
Solution: Queue queries, process async, notify via SSE.

Flow:
  1. POST /chat → Returns 202 Accepted + job_id
  2. Job queued in background thread worker
  3. Worker processes job, stores result
  4. Client polls SSE or webhook for result

Module: NEW — Query Queue
Status: ACTIVE
"""

from cassandra.queue.query_queue import QueryQueue, QueuedJob

__all__ = ["QueryQueue", "QueuedJob"]
