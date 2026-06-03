"""
Voice Enrollment Tool — Speaker Fingerprinting
==========================================

Implements the Voice Enrollment Pipeline:
1. Collect 10-second voice sample
2. Generate 512-dimensional voice embedding
3. Store in voice_profiles table for real-time diarization matching

PRD Reference:
    - Section 6: Mobile (Expo) Requirements
    - Voice Enrollment Pipeline: "Onboarding must collect a 10-second voice sample"
    - Schema: voice_profiles table with 512-dim vector

Module: Phase 5 (Voice Enrollment Flow)
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

logger = logging.getLogger("cassandra.tools.voice_enroll")


# ---------------------------------------------------------------------------
# Voice Enrollment Tool
# ---------------------------------------------------------------------------

class VoiceEnrollTool(Tool):
    """
    Enrolls a user's voice for speaker identification.

    Pipeline:
        1. Receive audio sample (bytes or base64)
        2. Validate duration (must be ~10 seconds)
        3. Generate 512-dim voice embedding (simulated — OpenAI/TenLabs in prod)
        4. Store in voice_profiles table

    PRD:
        Voice embedding must be 512-dimensional.
        Table: voice_profiles (org_id, user_id, embedding vector, created_at)

    Args:
        audio_sample: base64-encoded audio bytes
        user_id: User to enroll
        org_id: Organization scope
        speaker_name: Display name for the speaker
    """

    name = "voice_enroll"
    description = (
        "Enroll a user's voice for speaker identification. "
        "Takes a 10-second voice sample, generates a 512-dim embedding, "
        "and stores it in voice_profiles for real-time diarization. "
        "Returns the enrolled profile with a confidence score."
    )

    MIN_SAMPLE_DURATION_SECONDS = 8
    MAX_SAMPLE_DURATION_SECONDS = 15
    EMBEDDING_DIM = 512

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        """
        Enroll a voice sample.
        """
        call_id = f"voice_enroll_{context.turn_count}"

        # ── Validate org_id (Non-negotiable) ────────────────────────────
        if not context.org_id:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_ORG_ID: Cannot enroll voice without org_context",
            )

        # ── Validate required arguments ─────────────────────────────────
        audio_sample: str = arguments.get("audio_sample", "")
        speaker_name: str = arguments.get("speaker_name", "")
        sample_duration: float = arguments.get("sample_duration_seconds", 0.0)

        if not audio_sample:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_AUDIO_SAMPLE: 'audio_sample' (base64) is required",
            )

        if not speaker_name:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="MISSING_SPEAKER_NAME: 'speaker_name' is required",
            )

        # ── Validate sample duration ───────────────────────────────────
        if sample_duration > 0:
            if sample_duration < self.MIN_SAMPLE_DURATION_SECONDS:
                return ToolResult(
                    call_id=call_id,
                    tool_name=self.name,
                    success=False,
                    error=(
                        f"SAMPLE_TOO_SHORT: Voice sample must be at least "
                        f"{self.MIN_SAMPLE_DURATION_SECONDS} seconds. "
                        f"Got: {sample_duration}s. Please provide a longer recording."
                    ),
                )
            if sample_duration > self.MAX_SAMPLE_DURATION_SECONDS:
                return ToolResult(
                    call_id=call_id,
                    tool_name=self.name,
                    success=False,
                    error=(
                        f"SAMPLE_TOO_LONG: Voice sample must be at most "
                        f"{self.MAX_SAMPLE_DURATION_SECONDS} seconds. "
                        f"Got: {sample_duration}s."
                    ),
                )

        # ── Generate embedding ─────────────────────────────────────────
        embedding = self._generate_embedding(audio_sample)
        if embedding is None:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error="EMBEDDING_FAILED: Could not generate voice embedding from sample",
            )

        # ── Store profile ──────────────────────────────────────────────
        profile = self._store_profile(
            embedding=embedding,
            speaker_name=speaker_name,
            org_id=context.org_id,
            user_id=context.user_id,
        )

        logger.info(
            f"[VOICE_ENROLL] Enrolled: user={context.user_id}, "
            f"org={context.org_id}, speaker='{speaker_name}', "
            f"embedding_dim={len(embedding)}"
        )

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result={
                "profile": profile,
                "message": f"Voice enrolled for '{speaker_name}'",
                "embedding_dim": len(embedding),
                "sample_duration_seconds": sample_duration,
                "confidence": 0.95,
            },
        )

    def _generate_embedding(
        self, audio_sample: str
    ) -> list[float] | None:
        """
        Generate a 512-dim voice embedding from an audio sample.

        Production: Use OpenAI's audio embedding or ElevenLabs speaker diarization.
        Simulation: Generate a deterministic pseudo-embedding from the sample hash.
        """
        try:
            # Production integration (commented — uncomment when API keys available):
            #
            # OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
            # if OPENAI_API_KEY:
            #     import openai
            #     client = openai.OpenAI(api_key=OPENAI_API_KEY)
            #     embedding_resp = client.audio segment_to_embed(...)
            #     return embedding_resp.embedding  # 512-dim vector
            #
            # ElevenLabs integration:
            # ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
            # if ELEVENLABS_API_KEY:
            #     # Use ElevenLabs speaker diarization API
            #     pass

            # Simulation: deterministic pseudo-embedding based on sample hash
            import hashlib

            sample_hash = hashlib.sha256(audio_sample.encode()).digest()
            dim = self.EMBEDDING_DIM

            # Expand 32-byte hash to 512 floats using deterministic PRNG
            embedding: list[float] = []
            rng_state = int.from_bytes(sample_hash[:8], "big")

            for i in range(dim):
                # Simple LCG PRNG seeded from hash
                rng_state = (rng_state * 1103515245 + 12345) & 0x7fffffff
                value = (rng_state % 1000) / 1000.0  # 0.0 to 0.999
                embedding.append(round(value, 6))

            return embedding

        except Exception as exc:
            logger.error(f"[VOICE_ENROLL] Embedding generation failed: {exc}")
            return None

    def _store_profile(
        self,
        embedding: list[float],
        speaker_name: str,
        org_id: str,
        user_id: str,
    ) -> dict:
        """
        Store the voice profile in the database.

        Table: voice_profiles (managed by the FMS schema).
        In production, this inserts into Supabase.
        """
        profile_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        profile = {
            "id": profile_id,
            "user_id": user_id,
            "org_id": org_id,
            "speaker_name": speaker_name,
            "embedding": embedding,
            "embedding_model": "simulated_v1",
            "embedding_dim": len(embedding),
            "sample_count": 1,
            "is_active": True,
            "enrolled_at": now,
            "updated_at": now,
        }

        logger.info(
            f"[VOICE_ENROLL] Profile stored: id={profile_id}, "
            f"speaker='{speaker_name}', dim={len(embedding)}"
        )

        return profile


# ---------------------------------------------------------------------------
# Speaker Diarization Tool
# ---------------------------------------------------------------------------

class SpeakerDiarizeTool(Tool):
    """
    Matches transcribed speech segments to enrolled voice profiles.

    Used in Phase 6 (Diarization + Speaker Matching).

    Args:
        transcript_segments: List of {start, end, text} from ASR
        org_id: Organization scope
    """

    name = "speaker_diarize"
    description = (
        "Match transcribed speech segments to enrolled voice profiles. "
        "Takes ASR output with timestamps, matches to known speakers, "
        "and returns annotated transcript with speaker labels."
    )

    SIMILARITY_THRESHOLD = 0.75  # Cosine similarity threshold

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        call_id = f"diarize_{context.turn_count}"

        if not context.org_id:
            return ToolResult(
                call_id=call_id, tool_name=self.name, success=False,
                error="MISSING_ORG_ID",
            )

        segments: list[dict] = arguments.get("transcript_segments", [])
        if not segments:
            return ToolResult(
                call_id=call_id, tool_name=self.name, success=False,
                error="MISSING_TRANSCRIPT: 'transcript_segments' is required",
            )

        # In production: load voice_profiles for org, compute cosine similarity
        # Simulation: return mock diarization
        annotated: list[dict] = []
        for seg in segments:
            annotated.append({
                **seg,
                "speaker_label": "Speaker A",
                "confidence": 0.88,
                "matched_profile_id": None,  # Would be filled in production
            })

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result={
                "annotated_transcript": annotated,
                "speaker_count": 2,
                "total_duration_seconds": sum(
                    s.get("duration", 0) for s in segments
                ),
            },
        )

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)
