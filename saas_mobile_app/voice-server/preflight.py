"""
Autopilot Voice Preflight Test Script

Verifies end-to-end connectivity from this host to the FastAPI voice server
and simulates the exact WebSocket protocol used by the Expo app.

Usage:
    cd saas_mobile/voice-server
    uv pip install -r requirements.txt
    python preflight.py

Expected output: all checks PASS ✅
"""

import asyncio
import base64
import json
import sys
import time

import httpx
import websockets

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000"
TEST_EMAIL = "sanyog@gmail.com"
TEST_ORG = "test-org-preflight"

# Minimal fake Supabase JWT (unsigned, for testing)
FAKE_JWT_HEADER = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
FAKE_JWT_PAYLOAD = base64.urlsafe_b64encode(
    json.dumps({"sub": "user-sanyog-123", "email": TEST_EMAIL, "iat": int(time.time())}).encode()
).decode().rstrip("=")
FAKE_JWT = f"{FAKE_JWT_HEADER}.{FAKE_JWT_PAYLOAD}."

CHECKS = []

def check(name: str, passed: bool, detail: str = ""):
    CHECKS.append((name, passed, detail))
    icon = "✅" if passed else "❌"
    print(f"{icon} {name}" + (f" — {detail}" if detail else ""))


async def test_health():
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{BASE_URL}/health", timeout=5.0)
            data = r.json()
            check(
                "Health endpoint",
                r.status_code == 200 and data.get("status") == "ok",
                f"status={data.get('status')}, ws_sessions={data.get('active_ws_sessions')}",
            )
        except Exception as e:
            check("Health endpoint", False, str(e))


async def test_preflight_endpoint():
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{BASE_URL}/preflight", timeout=5.0)
            data = r.json()
            check(
                "Preflight endpoint",
                r.status_code == 200 and data.get("status") == "ready",
                f"test_user={data.get('test_user')}",
            )
        except Exception as e:
            check("Preflight endpoint", False, str(e))


async def test_auth_session():
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{BASE_URL}/auth/session",
                json={"user_jwt": FAKE_JWT, "api_key": ""},
                timeout=5.0,
            )
            data = r.json()
            token = data.get("cassandra_token", "")
            check(
                "Auth session exchange",
                r.status_code == 200 and token.startswith("preflight-"),
                f"token_prefix={token[:30]}..., expires_at={data.get('expires_at')}",
            )
            return token
        except Exception as e:
            check("Auth session exchange", False, str(e))
            return None


async def test_websocket_voice_pipeline(token: str):
    uri = f"{WS_URL}/ws/audio/{TEST_ORG}"
    try:
        async with websockets.connect(uri, open_timeout=5.0) as ws:
            # 1. Send session_start
            await ws.send(json.dumps({
                "type": "session_start",
                "cassandra_token": token,
            }))

            # 2. Wait for session_acknowledged
            ack = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
            check(
                "WS session acknowledged",
                ack.get("type") == "session_acknowledged",
                f"received_type={ack.get('type')}",
            )

            # 3. Send ping
            await ws.send(json.dumps({"type": "ping"}))
            pong = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
            check(
                "WS heartbeat ping/pong",
                pong.get("type") == "pong",
                f"received_type={pong.get('type')}",
            )

            # 4. Send 3 mock audio chunks
            for i in range(3):
                fake_pcm = base64.b64encode(b"\x00\x01" * 320).decode()  # 640 bytes = 320 samples
                await ws.send(json.dumps({
                    "type": "audio_chunk",
                    "data": fake_pcm,
                    "timestamp_ms": int(time.time() * 1000),
                    "seq": i,
                }))
                await asyncio.sleep(0.1)

            # 5. Wait for AI response
            got_segment = False
            got_voice_response = False
            got_audio = False

            for _ in range(10):
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    if isinstance(msg, bytes):
                        got_audio = True
                        continue
                    data = json.loads(msg)
                    if data.get("type") == "segment":
                        got_segment = True
                    elif data.get("type") == "voice_response":
                        got_voice_response = True
                        print(f"   🤖 AI said: {data.get('text', '')[:80]}...")
                    elif data.get("type") == "audio_chunk":
                        got_audio = True
                except asyncio.TimeoutError:
                    break

            check(
                "WS transcript segment received",
                got_segment,
                f"got_segment={got_segment}",
            )
            check(
                "WS voice response received",
                got_voice_response,
                f"got_voice_response={got_voice_response}",
            )
            check(
                "WS audio payload received",
                got_audio,
                f"got_audio={got_audio}",
            )

    except Exception as e:
        check("WS connection", False, str(e))
        check("WS session acknowledged", False, "connection failed")
        check("WS heartbeat ping/pong", False, "connection failed")
        check("WS transcript segment received", False, "connection failed")
        check("WS voice response received", False, "connection failed")
        check("WS audio payload received", False, "connection failed")


async def test_cors():
    async with httpx.AsyncClient() as client:
        try:
            r = await client.options(
                f"{BASE_URL}/auth/session",
                headers={
                    "Origin": "http://localhost:8081",
                    "Access-Control-Request-Method": "POST",
                },
                timeout=5.0,
            )
            check(
                "CORS preflight for port 8081",
                r.status_code == 200 and "access-control-allow-origin" in r.headers,
                f"status={r.status_code}",
            )
        except Exception as e:
            check("CORS preflight for port 8081", False, str(e))


async def main():
    print("=" * 60)
    print("🎙️  Autopilot Voice Preflight Test")
    print(f"   Base URL: {BASE_URL}")
    print(f"   Test user: {TEST_EMAIL}")
    print("=" * 60)
    print()

    await test_health()
    await test_preflight_endpoint()
    await test_cors()
    token = await test_auth_session()
    if token:
        await test_websocket_voice_pipeline(token)

    print()
    print("=" * 60)
    passed = sum(1 for _, p, _ in CHECKS if p)
    total = len(CHECKS)
    if passed == total:
        print(f"🎉 ALL {total} CHECKS PASSED — voice server is ready!")
    else:
        print(f"⚠️  {passed}/{total} checks passed — review failures above.")
    print("=" * 60)
    return 0 if passed == total else 1


if __name__ == "__main__":
    try:
        code = asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
        code = 1
    sys.exit(code)
