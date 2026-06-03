from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def load_shared_env() -> None:
    """Load shared repo env files for local development."""
    root = Path(__file__).resolve().parents[2]

    for env_file in (
        root / ".env.shared",
        root / ".env.shared.local",
        Path(__file__).resolve().parent / ".env",
    ):
        if env_file.exists():
            load_dotenv(env_file, override=False)
