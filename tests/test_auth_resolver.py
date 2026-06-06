"""
Regression tests for org_id hydration (Handshake Protocol C0-17)
================================================================
Run: python3 -m cassandra.tests.test_auth_resolver
"""
import base64
import hmac
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from cassandra.orchestrator.api_server import (
    decode_jwt_payload,
    verify_jwt_signature,
    AuthError,
    _auth_failures,
)


def make_test_jwt(payload: dict, secret: str) -> str:
    """Create a signed HS256 JWT for testing."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{header}.{body}.{signature}"


def test_decode_jwt_payload():
    payload = {"sub": "user-123", "org_id": "org-456", "exp": int(time.time()) + 3600}
    token = make_test_jwt(payload, "test-secret")
    decoded = decode_jwt_payload(token)
    assert decoded["sub"] == "user-123"
    assert decoded["org_id"] == "org-456"
    print("✓ decode_jwt_payload works")


def test_verify_jwt_signature_valid():
    secret = "my-super-secret"
    payload = {"sub": "user-123", "exp": int(time.time()) + 3600}
    token = make_test_jwt(payload, secret)
    result = verify_jwt_signature(token, secret)
    assert result["sub"] == "user-123"
    print("✓ verify_jwt_signature accepts valid token")


def test_verify_jwt_signature_invalid_secret():
    token = make_test_jwt({"sub": "user-123", "exp": int(time.time()) + 3600}, "correct-secret")
    try:
        verify_jwt_signature(token, "wrong-secret")
        assert False, "Should have raised AuthError"
    except AuthError as e:
        assert "Invalid JWT signature" in str(e)
        print("✓ verify_jwt_signature rejects wrong secret")


def test_verify_jwt_signature_expired():
    secret = "test-secret"
    payload = {"sub": "user-123", "exp": int(time.time()) - 10}
    token = make_test_jwt(payload, secret)
    try:
        verify_jwt_signature(token, secret)
        assert False, "Should have raised AuthError"
    except AuthError as e:
        assert "expired" in str(e)
        print("✓ verify_jwt_signature rejects expired token")


def test_verify_jwt_signature_missing_secret():
    try:
        verify_jwt_signature("any-token", "")
        assert False, "Should have raised AuthError"
    except AuthError as e:
        assert "Invalid JWT" in str(e)
        print("✓ verify_jwt_signature rejects missing secret")


def test_auth_failure_counters():
    before = dict(_auth_failures)
    # Trigger a verification failure
    try:
        token = make_test_jwt({"sub": "x", "exp": int(time.time()) + 3600}, "s1")
        verify_jwt_signature(token, "s2")
    except AuthError:
        pass
    assert _auth_failures["jwt_verify"] == before["jwt_verify"] + 1
    print("✓ auth failure counters increment")


if __name__ == "__main__":
    print("Running auth resolver regression tests...\n")
    test_decode_jwt_payload()
    test_verify_jwt_signature_valid()
    test_verify_jwt_signature_invalid_secret()
    test_verify_jwt_signature_expired()
    test_verify_jwt_signature_missing_secret()
    test_auth_failure_counters()
    print("\nAll tests passed.")
