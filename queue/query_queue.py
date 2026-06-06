"""
Query Queue — Background Worker for LLM Load Management
=====================================================

Problem:
- Continuous queries burn through LLM tokens (expensive)
- Burst traffic causes hallucination spikes (LLM overwhelmed)
- Users get slow responses during peak hours

Solution:
- Background thread worker processes queries
- Queue smooths burst traffic
- LLM processes ONE query at a time (or N workers for N concurrency)
- SSE notifies client of progress

Architecture:
  User Query → FastAPI → Enqueue → 202 Accepted
                                  ↓
                           Background Worker
                                  ↓
                           LLM Orchestrator
                                  ↓
                           Store Result
                                  ↓
                           SSE → Client

Module: NEW — Query Queue
Status: ACTIVE
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

logger = logging.getLogger("cassandra.queue")


# ---------------------------------------------------------------------------
# Queued Job
# ---------------------------------------------------------------------------

@dataclass
class QueuedJob:
    """
    A single queued job for the background worker.

    Attributes:
        job_id: Unique job identifier
        message: User's message
        context: Request context (org_id, user_id, role, photo_url, etc.)
        created_at: Unix timestamp when job was created
        started_at: Unix timestamp when processing started
        completed_at: Unix timestamp when job completed
        status: queued | processing | done | failed
        result: The orchestrator result (dict)
        error: Error message if failed
        steps: Real-time progress events emitted during processing.
               Each step is {"type": "tool_start"|"tool_result"|"reasoning", "data": {...}}.
               The SSE poller reads this list incrementally so the client sees live progress.
    """
    job_id: str
    message: str
    context: dict[str, Any]
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    status: str = "queued"  # queued | processing | done | failed
    result: Optional[dict] = None
    error: Optional[str] = None
    steps: list = field(default_factory=list)  # live progress steps for real-time CoT streaming

    def to_dict(self) -> dict:
        """Serialize to dict for JSON responses."""
        return {
            "job_id": self.job_id,
            "message": self.message[:100] + "..." if len(self.message) > 100 else self.message,
            "status": self.status,
            "created_at": datetime.fromtimestamp(self.created_at, tz=timezone.utc).isoformat(),
            "started_at": datetime.fromtimestamp(self.started_at, tz=timezone.utc).isoformat() if self.started_at else None,
            "completed_at": datetime.fromtimestamp(self.completed_at, tz=timezone.utc).isoformat() if self.completed_at else None,
            "result": self.result,
            "error": self.error,
            "processing_ms": (
                int((self.completed_at - self.started_at) * 1000)
                if self.started_at and self.completed_at
                else None
            ),
        }


# ---------------------------------------------------------------------------
# Query Queue
# ---------------------------------------------------------------------------

class QueryQueue:
    """
    Background job queue for LLM orchestrator.

    Design:
    - Thread-safe queue with max size (prevents memory overflow)
    - Single background worker thread (processes one job at a time)
    - Jobs stored in memory (dict for O(1) lookup by job_id)
    - TTL-based cleanup (jobs expire after 1 hour)

    Concurrency: 1 worker by default, configurable via max_workers.
    """

    DEFAULT_MAX_SIZE = 1000
    DEFAULT_TTL_SECONDS = 3600  # 1 hour

    def __init__(
        self,
        max_size: int = DEFAULT_MAX_SIZE,
        max_workers: int = 1,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ):
        """
        Initialize the query queue.

        Args:
            max_size: Maximum queue size (default 1000). Oldest jobs dropped if full.
            max_workers: Number of concurrent workers (default 1).
            ttl_seconds: Job TTL in seconds (default 3600 = 1 hour).
        """
        self._queue: queue.Queue = queue.Queue(maxsize=max_size)
        self._jobs: dict[str, QueuedJob] = {}
        self._workers: list[threading.Thread] = []
        self._running = False
        self._handler: Optional[Callable[[QueuedJob], dict]] = None
        self._max_workers = max_workers
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._logger = logger

        self._logger.info(
            f"QueryQueue initialized: max_size={max_size}, "
            f"max_workers={max_workers}, ttl={ttl_seconds}s"
        )

    def enqueue(
        self,
        message: str,
        context: dict[str, Any],
    ) -> str:
        """
        Enqueue a job for background processing.

        Args:
            message: User's message
            context: Request context (org_id, user_id, role, photo_url, etc.)

        Returns:
            job_id: Unique job identifier

        Raises:
            queue.Full: If queue is at max capacity
        """
        job_id = str(uuid.uuid4())
        job = QueuedJob(
            job_id=job_id,
            message=message,
            context=context,
        )

        with self._lock:
            self._jobs[job_id] = job

        # Non-blocking put (raises Full if at capacity)
        self._queue.put(job, block=False)

        self._logger.info(
            f"[QUEUE] Enqueued job {job_id}: message='{message[:60]}...', "
            f"org={context.get('org_id', 'UNKNOWN')}"
        )

        return job_id

    def get_job(self, job_id: str) -> Optional[QueuedJob]:
        """Get a job by ID. Returns None if not found or expired."""
        with self._lock:
            job = self._jobs.get(job_id)

            if job and self._is_expired(job):
                # Clean up expired job
                del self._jobs[job_id]
                return None

            return job

    def get_job_status(self, job_id: str) -> Optional[dict]:
        """Get job status as a dict (for JSON responses)."""
        job = self.get_job(job_id)
        if not job:
            return None
        return job.to_dict()

    def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a queued job (if not yet processing).

        Returns:
            True if cancelled, False if not found or already processing
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status == "processing":
                return False  # Can't cancel while processing
            job.status = "failed"
            job.error = "Cancelled by user"
            job.completed_at = time.time()
            return True

    def _is_expired(self, job: QueuedJob) -> bool:
        """Check if a job has expired (TTL exceeded)."""
        if job.completed_at:
            age = time.time() - job.completed_at
        else:
            age = time.time() - job.created_at
        return age > self._ttl_seconds

    def _cleanup_expired(self) -> int:
        """Remove expired jobs. Returns count of cleaned jobs."""
        with self._lock:
            expired = [
                jid
                for jid, job in self._jobs.items()
                if self._is_expired(job)
            ]
            for jid in expired:
                del self._jobs[jid]
            if expired:
                self._logger.info(f"[QUEUE] Cleaned up {len(expired)} expired jobs")
            return len(expired)

    def start_worker(
        self,
        handler: Callable[[QueuedJob], dict],
    ):
        """
        Start background worker threads.

        Args:
            handler: Function that processes a QueuedJob and returns a dict result.
                     The handler receives the job and should populate job.result.
        """
        if self._running:
            self._logger.warning("[QUEUE] Worker already running")
            return

        self._handler = handler
        self._running = True

        # Start worker threads
        for i in range(self._max_workers):
            t = threading.Thread(
                target=self._run_worker,
                args=(i,),
                name=f"queue-worker-{i}",
                daemon=True,
            )
            t.start()
            self._workers.append(t)

        # Start cleanup thread
        cleanup_t = threading.Thread(
            target=self._run_cleanup,
            name="queue-cleanup",
            daemon=True,
        )
        cleanup_t.start()
        self._workers.append(cleanup_t)

        self._logger.info(
            f"[QUEUE] Started {self._max_workers} worker(s) + cleanup thread"
        )

    def stop_worker(self, timeout: float = 5.0):
        """
        Stop the background worker threads.

        Args:
            timeout: Seconds to wait for workers to finish current job
        """
        if not self._running:
            return

        self._running = False

        # Wait for workers to finish
        for t in self._workers:
            t.join(timeout=timeout)

        self._workers.clear()
        self._logger.info("[QUEUE] Worker stopped")

    def _run_worker(self, worker_id: int):
        """Worker thread: processes jobs from the queue."""
        self._logger.info(f"[QUEUE] Worker {worker_id} started")

        while self._running:
            try:
                # Get job with timeout (allows checking _running flag periodically)
                job: QueuedJob = self._queue.get(timeout=1.0)
            except queue.Empty:
                continue

            # Process the job
            job.status = "processing"
            job.started_at = time.time()

            self._logger.info(
                f"[QUEUE] Worker {worker_id} processing job {job.job_id}: "
                f"'{job.message[:60]}...'"
            )

            try:
                result = self._handler(job)
                job.result = result
                job.status = "done"
                self._logger.info(
                    f"[QUEUE] Job {job.job_id} done: "
                    f"response_length={len(str(result))}"
                )
            except Exception as exc:
                job.error = f"{type(exc).__name__}: {exc}"
                job.status = "failed"
                self._logger.error(
                    f"[QUEUE] Job {job.job_id} failed: {exc}",
                    exc_info=True,
                )
            finally:
                job.completed_at = time.time()
                self._queue.task_done()

        self._logger.info(f"[QUEUE] Worker {worker_id} stopped")

    def _run_cleanup(self):
        """Cleanup thread: removes expired jobs every 60 seconds."""
        while self._running:
            time.sleep(60)
            if not self._running:
                break
            count = self._cleanup_expired()

    def get_queue_stats(self) -> dict:
        """Get queue statistics for monitoring."""
        with self._lock:
            stats = {
                "queued": sum(1 for j in self._jobs.values() if j.status == "queued"),
                "processing": sum(1 for j in self._jobs.values() if j.status == "processing"),
                "done": sum(1 for j in self._jobs.values() if j.status == "done"),
                "failed": sum(1 for j in self._jobs.values() if j.status == "failed"),
                "total": len(self._jobs),
                "max_size": self._queue.maxsize,
                "max_workers": self._max_workers,
                "ttl_seconds": self._ttl_seconds,
            }
            return stats


# ---------------------------------------------------------------------------
# Global singleton instance (for use in api_server.py)
# ---------------------------------------------------------------------------

# This will be initialized by api_server.py when starting the server
_global_queue: Optional[QueryQueue] = None


def get_queue() -> QueryQueue:
    """Get the global queue instance."""
    global _global_queue
    if _global_queue is None:
        _global_queue = QueryQueue()
    return _global_queue


def init_queue(max_size: int = 1000, max_workers: int = 1) -> QueryQueue:
    """Initialize the global queue with specific settings."""
    global _global_queue
    _global_queue = QueryQueue(max_size=max_size, max_workers=max_workers)
    return _global_queue
