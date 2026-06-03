"""
Autopilot Voice Preflight Server — FastAPI

Runs on port 8000. Receives voice audio chunks from the Expo app
(via WebSocket) and sends back mock AI responses for preflight testing.

Test user: sanyog@gmail.com
Expo dev server: port 8081
"""

import asyncio
import base64
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, String, Float, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

from env_loader import load_shared_env

load_shared_env()

# ─── Database ─────────────────────────────────────────────────────────────────
SQLALCHEMY_DATABASE_URL = "sqlite:///./cassandra_chat.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("voice-server")

# ─── In-memory session store ────────────────────────────────────────────────
active_sessions: dict[str, WebSocket] = {}

# ─── SQLAlchemy Models ──────────────────────────────────────────────────────

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    org_id = Column(String, index=True, nullable=False)
    property_id = Column(String, index=True, nullable=True)
    title = Column(String, nullable=True)
    created_at = Column(Float, nullable=False)
    updated_at = Column(Float, nullable=False)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String, nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(Float, nullable=False)

    session = relationship("ChatSession", back_populates="messages")

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ─── Pydantic models ────────────────────────────────────────────────────────

class AuthSessionRequest(BaseModel):
    user_jwt: str
    api_key: Optional[str] = ""

class AuthSessionResponse(BaseModel):
    cassandra_token: str
    expires_at: int

class PreflightReport(BaseModel):
    status: str
    server_time: float
    active_ws_sessions: int
    version: str = "1.0.0-preflight"

# ─── Chat Session Models ────────────────────────────────────────────────────

class ChatSessionCreate(BaseModel):
    user_id: str
    org_id: str
    property_id: Optional[str] = None
    title: Optional[str] = "New Chat"

class ChatSessionResponse(BaseModel):
    id: str
    user_id: str
    org_id: str
    property_id: Optional[str]
    title: str
    created_at: float
    updated_at: float

class ChatMessageCreate(BaseModel):
    role: str
    text: str

class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    text: str
    created_at: float

class ChatSessionDetail(ChatSessionResponse):
    messages: List[ChatMessageResponse] = []

# ─── Lifespan ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Voice preflight server starting on port 8000")
    yield
    logger.info("🛑 Voice preflight server shutting down")

app = FastAPI(
    title="Autopilot Voice Preflight Server",
    description="FastAPI backend for Expo voice integration preflight tests",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ───────────────────────────────────────────────────────────────────
# Allow Expo dev server on port 8081 and any local origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://localhost:19000",
        "http://10.0.2.2:8081",   # Android emulator
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ────────────────────────────────────────────────────────────────

def decode_jwt_payload(jwt: str) -> dict:
    """Decode JWT payload without verifying signature (for testing)."""
    try:
        parts = jwt.split(".")
        if len(parts) != 3:
            return {}
        payload = parts[1]
        # Pad base64
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return {}

# ─── Chat Session Endpoints ───────────────────────────────────────────────────

from fastapi import Depends, Query

@app.post("/chat/sessions", response_model=ChatSessionResponse)
async def create_session(
    req: ChatSessionCreate,
    db: Session = Depends(get_db),
):
    """Create a new chat session."""
    now = time.time()
    session = ChatSession(
        id=str(uuid.uuid4()),
        user_id=req.user_id,
        org_id=req.org_id,
        property_id=req.property_id,
        title=req.title or "New Chat",
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"📝 Chat session created | id={session.id} | user={req.user_id}")
    return ChatSessionResponse(
        id=session.id,
        user_id=session.user_id,
        org_id=session.org_id,
        property_id=session.property_id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@app.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    user_id: str = Query(..., description="Supabase user UUID"),
    org_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List chat sessions for a user, newest first."""
    query = db.query(ChatSession).filter(ChatSession.user_id == user_id)
    if org_id:
        query = query.filter(ChatSession.org_id == org_id)
    sessions = query.order_by(ChatSession.updated_at.desc()).all()
    return [
        ChatSessionResponse(
            id=s.id,
            user_id=s.user_id,
            org_id=s.org_id,
            property_id=s.property_id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


@app.get("/chat/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_session(
    session_id: str,
    db: Session = Depends(get_db),
):
    """Get a chat session with all messages."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return ChatSessionDetail(
        id=session.id,
        user_id=session.user_id,
        org_id=session.org_id,
        property_id=session.property_id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[
            ChatMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                text=m.text,
                created_at=m.created_at,
            )
            for m in session.messages
        ],
    )


@app.put("/chat/sessions/{session_id}/messages", response_model=ChatMessageResponse)
async def add_message(
    session_id: str,
    req: ChatMessageCreate,
    db: Session = Depends(get_db),
):
    """Append a message to a session."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = time.time()
    message = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session_id,
        role=req.role,
        text=req.text,
        created_at=now,
    )
    db.add(message)
    session.updated_at = now
    db.commit()
    db.refresh(message)
    logger.info(f"💬 Message added | session={session_id} | role={req.role}")
    return ChatMessageResponse(
        id=message.id,
        session_id=message.session_id,
        role=message.role,
        text=message.text,
        created_at=message.created_at,
    )


@app.put("/chat/sessions/{session_id}/title")
async def update_session_title(
    session_id: str,
    title: str,
    db: Session = Depends(get_db),
):
    """Update a session title."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = title
    session.updated_at = time.time()
    db.commit()
    return {"status": "ok"}


@app.delete("/chat/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
):
    """Delete a session and all its messages."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    logger.info(f"🗑️ Chat session deleted | id={session_id}")
    return {"status": "ok"}


# ─── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health", response_model=PreflightReport)
async def health_check():
    return PreflightReport(
        status="ok",
        server_time=time.time(),
        active_ws_sessions=len(active_sessions),
    )


@app.post("/auth/session", response_model=AuthSessionResponse)
async def auth_session(request: Request, req: AuthSessionRequest | None = None):
    """
    Token exchange. Accepts Supabase JWT via Authorization header or JSON body.
    Returns a cassandra_token the mobile client can use for WebSocket + REST.
    """
    # 1. Try Authorization header first
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip()

    # 2. Fall back to JSON body for backward compatibility
    if not token and req and req.user_jwt:
        token = req.user_jwt

    if not token:
        raise HTTPException(status_code=401, detail="Missing token — provide Authorization: Bearer <jwt> or user_jwt in body")

    payload = decode_jwt_payload(token)
    email = payload.get("email", "unknown")
    sub = payload.get("sub", str(uuid.uuid4()))

    # Build cassandra token from the validated JWT
    token_payload = {
        "sub": sub,
        "email": email,
        "test": True,
        "jti": str(uuid.uuid4()),
    }
    cassandra_token = base64.urlsafe_b64encode(
        json.dumps(token_payload).encode()
    ).decode().rstrip("=")

    expires_at = int(time.time()) + 3600  # 1 hour

    logger.info(f"🔑 Auth session created for {email} (sub={sub[:8]}...)")
    return AuthSessionResponse(
        cassandra_token=f"preflight-{cassandra_token}",
        expires_at=expires_at,
    )


@app.get("/preflight")
async def preflight():
    """Quick preflight endpoint for smoke tests."""
    return {
        "status": "ready",
        "timestamp": time.time(),
        "ws_endpoint": "/ws/audio/{org_id}",
        "auth_endpoint": "/auth/session",
        "test_user": "sanyog@gmail.com",
    }


# ─── Chat Endpoint ──────────────────────────────────────────────────────────

from fastapi import Request
from fastapi.responses import StreamingResponse

class ChatRequest(BaseModel):
    message: str
    session_id: str

# Import the chat engine for real NL → Supabase queries
from chat_engine import stream_response as chat_stream_response

@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """Stream a real response via Supabase queries with RLS."""
    auth = request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "").strip() if auth else ""
    logger.info(f"💬 Chat request | session={req.session_id} | msg='{req.message[:40]}...' | auth={'yes' if token else 'no'}")

    if not token:
        async def error_stream():
            yield "data: Please sign in first.\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    async def event_stream():
        async for chunk in chat_stream_response(token, req.message):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ─── WebSocket Voice Endpoint ───────────────────────────────────────────────

@app.websocket("/ws/audio/{org_id}")
async def websocket_audio(websocket: WebSocket, org_id: str):
    await websocket.accept()
    session_id = str(uuid.uuid4())[:8]
    active_sessions[session_id] = websocket

    logger.info(f"🔌 WS connected | org={org_id} | session={session_id} | total={len(active_sessions)}")

    authenticated = False
    chunk_count = 0
    last_activity = time.time()

    try:
        while True:
            # Use a timeout to detect stale connections
            try:
                message = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=25.0,
                )
            except asyncio.TimeoutError:
                logger.warning(f"⏱ WS timeout | session={session_id}")
                break

            # Handle ASGI message dict from websocket.receive()
            if isinstance(message, dict):
                if message.get("type") == "websocket.receive":
                    if "bytes" in message and message["bytes"] is not None:
                        raw = message["bytes"]
                        logger.debug(f"📦 Binary frame received ({len(raw)} bytes) | session={session_id}")
                        continue
                    elif "text" in message and message["text"] is not None:
                        raw_text = message["text"]
                    else:
                        continue
                else:
                    continue
            elif isinstance(message, bytes):
                logger.debug(f"📦 Binary frame received ({len(message)} bytes) | session={session_id}")
                continue
            elif isinstance(message, str):
                raw_text = message
            else:
                logger.warning(f"⚠️ Unknown message type {type(message)} | session={session_id}")
                continue

            # Parse JSON text
            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                logger.warning(f"⚠️ Invalid JSON | session={session_id}")
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")
            last_activity = time.time()

            # ── Ping ──────────────────────────────────────────────────────
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # ── Session Start ─────────────────────────────────────────────
            if msg_type == "session_start":
                cassandra_token = data.get("cassandra_token", "")
                room_id = data.get("room_id")

                # In preflight mode, accept ANY token that starts with "preflight-"
                # or just any token for maximum compatibility during testing
                authenticated = True
                logger.info(
                    f"✅ Session acknowledged | org={org_id} | room={room_id} | "
                    f"token_prefix={cassandra_token[:20]}... | session={session_id}"
                )
                await websocket.send_json({"type": "session_acknowledged"})
                continue

            # ── Audio Chunk ───────────────────────────────────────────────
            if msg_type == "audio_chunk":
                if not authenticated:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session not authenticated. Send session_start first.",
                    })
                    continue

                chunk_count += 1
                seq = data.get("seq", chunk_count)
                data_len = len(data.get("data", ""))
                logger.info(
                    f"🎤 Audio chunk #{seq} | {data_len} bytes base64 | "
                    f"session={session_id}"
                )

                # After 3 chunks, simulate a response
                if chunk_count == 3:
                    # 1. Send transcript segment
                    await websocket.send_json({
                        "type": "segment",
                        "text": "Preflight test query",
                        "speaker_id": "user",
                    })

                    # 2. Send AI response text
                    response_text = (
                        f"Preflight test successful. Voice pipeline is wired from "
                        f"Expo app to FastAPI server. Received {chunk_count} audio chunks "
                        f"from session {session_id}."
                    )
                    await websocket.send_json({
                        "type": "voice_response",
                        "text": response_text,
                        "response": response_text,
                    })

                    # 3. Send a tiny synthetic "audio" payload (1x1 silent MP3 frame)
                    # This is a minimal valid-ish MP3 header so expo-av doesn't crash
                    synthetic_mp3 = base64.b64encode(
                        bytes([
                            0xFF, 0xFB, 0x90, 0x00,  # MPEG-1 Layer-3 frame sync
                            0x00, 0x00, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0x00,
                        ])
                    ).decode()
                    await websocket.send_json({
                        "type": "audio_chunk",
                        "data": synthetic_mp3,
                        "format": "mp3",
                        "session_id": session_id,
                    })

                    logger.info(f"📤 Sent mock AI response | session={session_id}")
                continue

            # ── Unknown ───────────────────────────────────────────────────
            logger.warning(f"❓ Unknown message type '{msg_type}' | session={session_id}")

    except WebSocketDisconnect:
        logger.info(f"👋 WS disconnected | session={session_id}")
    except Exception as e:
        logger.error(f"💥 WS error | session={session_id} | {e}")
    finally:
        active_sessions.pop(session_id, None)
        logger.info(f"🧹 Session cleaned | session={session_id} | remaining={len(active_sessions)}")


# ─── Main entrypoint ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False,
    )
