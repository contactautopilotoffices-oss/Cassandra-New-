"""
Rate Limiter — Token Bucket Rate Limiting
=========================================

Implements PRD Section 8: Scaling & Token Efficiency:
    - LIMIT_TENANT: 5400 seconds (90 minutes of conversation)
    - LIMIT_MASTER_ADMIN: 0 (Unlimited)

Module: Phase 8+
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("cassandra.tools.rate_limiter")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LIMIT_TENANT_SECONDS = 5400   # 90 minutes of active conversation
LIMIT_ADMIN_SECONDS = 0       # Unlimited


@dataclass
class RateLimitResult:
    allowed: bool
    remaining_seconds: int
    reset_at: float            # Unix timestamp
    is_unlimited: bool         # True if admin/unlimited


# ---------------------------------------------------------------------------
# Rate Limiter
# ---------------------------------------------------------------------------

class RateLimiter:
    """
    Token-bucket rate limiter for Cassandra sessions.

    PRD Rules:
        - LIMIT_TENANT: 5400 seconds (90 min)
        - LIMIT_MASTER_ADMIN: 0 (Unlimited — no limit)

    Behavior:
        - Each user/org has a rolling time budget
        - Decrement by elapsed seconds on each request
        - If budget exhausted → 429 Too Many Requests
        - Admins have no limit (is_unlimited=True)
    """

    # Class-level store (in production, use Redis)
    _store: dict[str, dict] = {}

    def __init__(
        self,
        tenant_limit: int = LIMIT_TENANT_SECONDS,
        admin_limit: int = LIMIT_ADMIN_SECONDS,
    ):
        self.tenant_limit = tenant_limit
        self.admin_limit = admin_limit
        self.logger = logging.getLogger("cassandra.rate_limiter")

    def check(self, user_id: str, org_id: str, role: str) -> RateLimitResult:
        """
        Check if a request is within rate limits.

        Args:
            user_id: Requesting user
            org_id: Organization scope
            role: User role (determines limit tier)

        Returns:
            RateLimitResult with allowed/remaining/reset_at
        """
        key = f"{org_id}:{user_id}"
        now = time.time()
        is_admin = role.lower() in {
            "master_admin", "org_super_admin", "org_admin"
        }

        # Unlimited for admins
        if is_admin or self.admin_limit == 0:
            return RateLimitResult(
                allowed=True,
                remaining_seconds=0,
                reset_at=0,
                is_unlimited=True,
            )

        # Initialize if not seen
        if key not in self._store:
            self._store[key] = {
                "budget": self.tenant_limit,
                "reset_at": now + 86400,  # Daily reset
                "last_check": now,
            }
            self.logger.info(
                f"[RATE_LIMIT] New session: user={user_id}, org={org_id}, "
                f"budget={self.tenant_limit}s"
            )

        session = self._store[key]

        # Daily reset
        if now >= session["reset_at"]:
            session["budget"] = self.tenant_limit
            session["reset_at"] = now + 86400
            self.logger.info(f"[RATE_LIMIT] Budget reset for {key}")

        # Check budget
        if session["budget"] <= 0:
            self.logger.warning(
                f"[RATE_LIMIT] EXHAUSTED: user={user_id}, org={org_id}"
            )
            return RateLimitResult(
                allowed=False,
                remaining_seconds=0,
                reset_at=session["reset_at"],
                is_unlimited=False,
            )

        return RateLimitResult(
            allowed=True,
            remaining_seconds=int(session["budget"]),
            reset_at=session["reset_at"],
            is_unlimited=False,
        )

    def consume(self, user_id: str, org_id: str, elapsed_seconds: float) -> None:
        """Decrement budget after a request."""
        key = f"{org_id}:{user_id}"
        if key in self._store:
            self._store[key]["budget"] = max(
                0, self._store[key]["budget"] - elapsed_seconds
            )

    def get_status(self, user_id: str, org_id: str) -> Optional[RateLimitResult]:
        """Get current rate limit status without consuming budget."""
        key = f"{org_id}:{user_id}"
        if key not in self._store:
            return None
        session = self._store[key]
        return RateLimitResult(
            allowed=session["budget"] > 0,
            remaining_seconds=int(session["budget"]),
            reset_at=session["reset_at"],
            is_unlimited=False,
        )
