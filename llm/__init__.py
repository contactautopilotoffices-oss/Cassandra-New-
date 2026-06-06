"""
LLM Package — OpenAI GPT-4o as Single Command Center
====================================================

Architecture: One LLM instance orchestrates everything.
The 7 rule-based agents are deleted. Their functionality
is now handled by:
1. GPT-4o with function calling (delegation)
2. Updated tool system prompts (domain expertise)

Module: NEW — Single LLM Core
Status: ACTIVE
"""

from cassandra.llm.openai_client import OpenAIClient
from cassandra.llm.orchestrator import LLMOrchestrator

__all__ = ["OpenAIClient", "LLMOrchestrator"]
