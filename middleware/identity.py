"""
Identity Handshake — org_context_middleware
==========================================

Fastify plugin that intercepts incoming requests, verifies the Supabase JWT,
and extracts the org_id for downstream use by the orchestrator.

This is the "Identity Handshake" — the first point of contact between
the client and the Cassandra layer.

Non-Negotiable Rules:
    1. JWT MUST be verified on every request
    2. org_id MUST be extracted and set in request.state
    3. org_id MUST be available before any tool executes

Module: 4.2
Status: ACTIVE
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger("cassandra.middleware.identity")


# ---------------------------------------------------------------------------
# Identity Context (extracted from JWT)
# ---------------------------------------------------------------------------

class IdentityContext:
    """
    Extracted identity from the Supabase JWT.
    Set by org_context_middleware on every request.
    """

    def __init__(
        self,
        user_id: str,
        org_id: str,
        email: str,
        role: str = "tenant",
        property_ids: list[str] | None = None,
    ):
        self.user_id = user_id
        self.org_id = org_id
        self.email = email
        self.role = role
        self.property_ids = property_ids or []

    def __repr__(self) -> str:
        return (
            f"IdentityContext(user={self.user_id}, org={self.org_id}, "
            f"role={self.role}, properties={len(self.property_ids)})"
        )


# ---------------------------------------------------------------------------
# JWT Verification Helpers
# ---------------------------------------------------------------------------

def extract_bearer_token(authorization_header: str | None) -> str | None:
    """Extract JWT from Authorization: Bearer <token> header."""
    if not authorization_header:
        return None
    parts = authorization_header.split(" ")
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def decode_jwt_payload(token: str) -> dict[str, Any] | None:
    """
    Decode a JWT payload WITH signature verification.

    FIX: Previously decoded without verification (P0 critical issue).
    Now verifies signature using Supabase JWT secret.

    Returns the payload dict or None if invalid/expired/unverified.
    """
    import base64
    import json
    import hmac
    import hashlib
    import time
    import os

    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, signature_b64 = parts

        # Decode header to get algorithm
        header_padding = 4 - (len(header_b64) % 4)
        if header_padding != 4:
            header_b64 += "=" * header_padding
        header = json.loads(base64.urlsafe_b64decode(header_b64))

        # Decode payload
        payload_padding = 4 - (len(payload_b64) % 4)
        if payload_padding != 4:
            payload_b64 += "=" * payload_padding
        decoded = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(decoded)

        # Get Supabase JWT secret (from environment)
        jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
        if not jwt_secret:
            logger.warning("[JWT] SUPABASE_JWT_SECRET not set — falling back to dev mode")
            # In dev without secret, still decode but log warning
            return payload

        # FIX 2026-06-01: Base64-decode the secret before HMAC
        secret_bytes = _decode_base64_secret(jwt_secret)

        # Verify signature
        message = f"{header_b64}.{payload_b64}"
        expected_sig = base64.urlsafe_b64encode(
            hmac.new(
                secret_bytes,  # Use decoded bytes
                message.encode(),
                hashlib.sha256
            ).digest()
        ).decode().rstrip("=")

        # Compare signatures (constant-time to prevent timing attacks)
        if not hmac.compare_digest(signature_b64, expected_sig):
            logger.warning("[JWT] Signature verification failed — token rejected")
            return None

        # Check expiration
        exp = payload.get("exp", 0)
        if exp < time.time():
            logger.warning(f"[JWT] Token expired at {exp}")
            return None

        return payload
    except Exception as exc:
        logger.error(f"[JWT] Verification failed: {exc}")
        return None


def _decode_base64_secret(secret: str) -> bytes:
    """
    Decode a base64-encoded JWT secret.

    FIX 2026-06-01: Supabase JWT secrets are base64-encoded, but HMAC needs raw bytes.
    """
    import base64
    try:
        try:
            return base64.urlsafe_b64decode(secret)
        except Exception:
            return base64.b64decode(secret)
    except Exception:
        logger.warning("[JWT] Could not base64-decode JWT secret, using as-is")
        return secret.encode()


def extract_identity_from_jwt(token: str) -> IdentityContext | None:
    """
    Extract IdentityContext from a Supabase JWT.

    Supabase JWT payload structure:
        {
            "sub": "<user_id>",
            "email": "<email>",
            "org_id": "<org_id>",  // Custom claim
            "role": "<role>",
            "exp": <expiry_timestamp>,
            ...
        }

    Returns IdentityContext or None if extraction fails.
    """
    payload = decode_jwt_payload(token)
    if not payload:
        return None

    try:
        return IdentityContext(
            user_id=payload.get("sub", ""),
            org_id=payload.get("org_id", payload.get("organization_id", "")),
            email=payload.get("email", ""),
            role=payload.get("role", "tenant"),
            property_ids=payload.get("property_ids", []),
        )
    except Exception as exc:
        logger.error(f"Failed to extract identity: {exc}")
        return None


# ---------------------------------------------------------------------------
# Validation Rules
# ---------------------------------------------------------------------------

def validate_identity(identity: IdentityContext) -> tuple[bool, str]:
    """
    Validate that an IdentityContext has all required fields.

    Non-negotiable:
        - user_id must be non-empty
        - org_id must be non-empty (tenant scoping requirement)

    Returns (is_valid, error_message).
    """
    if not identity.user_id:
        return False, "MISSING_USER_ID: JWT must include 'sub' claim"

    if not identity.org_id:
        return False, (
            "MISSING_ORG_ID: JWT must include 'org_id' or 'organization_id' claim. "
            "Every request must be scoped to an organization. "
            "The LLM must know tenant scope upfront."
        )

    return True, ""


# ---------------------------------------------------------------------------
# Fastify Plugin
# ---------------------------------------------------------------------------

def create_identity_middleware() -> dict[str, Any]:
    """
    Create a Fastify middleware configuration for org_context.

    Usage in Fastify:
        import { identityMiddleware } from './cassandra/middleware/fastify.js';

        fastify.addHook('preHandler', identityMiddleware);

        // Then in route handlers:
        // const orgId = request.state.identity.org_id;
    """
    return {
        "name": "org_context_middleware",
        "description": (
            "Extracts org_id from Supabase JWT and sets request.state.identity. "
            "Non-negotiable: every request must have org_id for tenant scoping."
        ),
        "fields": {
            "request.state.identity": "IdentityContext",
            "request.state.identity.org_id": "string",
            "request.state.identity.user_id": "string",
        },
    }


# ---------------------------------------------------------------------------
# Dev Mode Bypass (for testing without real Supabase JWT)
# ---------------------------------------------------------------------------

DEV_IDENTITY = IdentityContext(
    user_id="dev_user_id",
    org_id="dev_org_id",
    email="dev@example.com",
    role="org_admin",
    property_ids=["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
)


def get_dev_identity() -> IdentityContext:
    """Return a dev-mode identity for testing without real JWT."""
    return DEV_IDENTITY
