"""
Regression tests for simple session tokens
==========================================
Run: python3 -m cassandra.tests.test_auth_resolver
"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from cassandra.orchestrator.api_server import (
    encode_session_token,
    decode_session_token,
)


def test_encode_decode_session_token():
    token = encode_session_token(
        user_id="user-123",
        org_id="org-456",
        property_id="prop-789",
        role="mst"
    )
    assert token is not None
    decoded = decode_session_token(token)
    assert decoded["user_id"] == "user-123"
    assert decoded["org_id"] == "org-456"
    assert decoded["property_id"] == "prop-789"
    assert decoded["role"] == "mst"
    print("✓ encode/decode session token works")


def test_decode_invalid_token():
    decoded = decode_session_token("invalid-token")
    assert decoded is None
    print("✓ decode rejects invalid token")


def test_token_expiry():
    # Create token with 1 second TTL
    token = encode_session_token("u1", "o1", "p1", ttl=1)
    time.sleep(2)
    decoded = decode_session_token(token)
    assert decoded is None
    print("✓ token expiry works")


if __name__ == "__main__":
    print("Running simple session token tests...\n")
    test_encode_decode_session_token()
    test_decode_invalid_token()
    test_token_expiry()
    print("\nAll tests passed.")
