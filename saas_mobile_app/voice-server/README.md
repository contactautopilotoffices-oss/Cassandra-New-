# Autopilot Voice Preflight Server

A minimal FastAPI backend for testing the Expo → FastAPI voice pipeline locally.

## What it does

- **Port:** `8000`
- **Health check:** `GET /health`
- **Auth:** `POST /auth/session` — accepts any Supabase JWT, returns a test `cassandra_token`
- **Voice WebSocket:** `WS /ws/audio/{org_id}` — implements the Cassandra V2 voice protocol
  - `session_start` → `session_acknowledged`
  - `audio_chunk` (base64 PCM16) → `segment` + `voice_response` + synthetic `audio_chunk` (MP3)
  - `ping` → `pong`

## Quick start

```bash
cd saas_mobile/voice-server

# Install deps (if not already available)
uv pip install -r requirements.txt
# or: pip install -r requirements.txt

# Start the server
python3 main.py
```

Server will be available at `http://localhost:8000`.

## Preflight test

With the server running:

```bash
python3 preflight.py
```

Expected result: **9/9 checks passed ✅**

## Expo app configuration

Make sure your `saas_mobile/.env` points to the server:

```env
# iOS Simulator or web
EXPO_PUBLIC_CASSANDRA_API_URL=http://localhost:8000
EXPO_PUBLIC_CASSANDRA_WS_URL=ws://localhost:8000

# Android Emulator (localhost does NOT work from emulator)
# EXPO_PUBLIC_CASSANDRA_API_URL=http://10.0.2.2:8000
# EXPO_PUBLIC_CASSANDRA_WS_URL=ws://10.0.2.2:8000
```

## Testing from the app as sanyog@gmail.com

1. Ensure the app is logged in as `sanyog@gmail.com` (or any user — the mock server accepts all JWTs)
2. Navigate to the **Cassandra** tab
3. Tap the **Sidekick face** — this opens the session modal in **voice mode**
4. Tap the face again inside the modal to start recording
5. Speak for ~2 seconds (send 3 audio chunks)
6. The server will respond with a mock AI message confirming the pipeline works

## Architecture

```
Expo app (port 8081)
  ├─ REST: http://localhost:8000/auth/session  →  cassandra_token
  └─ WS:   ws://localhost:8000/ws/audio/{org_id}
       ├─ send: { type: "session_start", cassandra_token }
       ├─ send: { type: "audio_chunk", data: base64_pcm16, seq, timestamp_ms }
       └─ recv: { type: "voice_response", text: "..." }
          recv: { type: "audio_chunk", data: base64_mp3 }
```

## Notes

- This is a **mock server** for preflight/integration testing only.
- It does not perform real speech-to-text or text-to-speech.
- It accepts **any** Supabase JWT without signature verification.
- The synthetic MP3 payload is a minimal valid frame — sufficient for `expo-av` to not crash during testing.
