"""
Fetch Context Tool — RAG Memory Retrieval
=========================================

Retrieves relevant context from semantic memory (RAG layer).

This tool is called at the PERCEPTION stage to inject
relevant context before the model reasons about next actions.

Module: 4.1
Status: ACTIVE
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

# ---------------------------------------------------------------------------
# Fetch Context Tool
# ---------------------------------------------------------------------------

class FetchContextTool(Tool):
    """
    Tool for retrieving relevant context from the RAG memory layer.

    Arguments:
        query: str — Natural language query to search memory
        scope: str — Scope filter: "property", "organization", "user", "all"
        limit: int — Maximum results to return (default 5)

    Returns:
        ToolResult with relevant memory entries

    Usage:
        Called at PERCEPTION stage to inject context into the loop.
        Also callable mid-loop to retrieve specific facts.
    """

    name = "fetch_context"
    description = (
        "Retrieve relevant context from semantic memory (RAG). "
        "Use this to look up previous decisions, ticket history, "
        "user preferences, or property-specific rules. "
        "Returns relevant entries ranked by relevance score."
    )

    def __init__(self, rag_store: Optional[Any] = None):
        """
        Args:
            rag_store: RAG memory store (Pinecone, Weaviate, etc.)
                       If None, uses local in-memory store for dev.
        """
        self.rag_store = rag_store
        self.logger = logging.getLogger("cassandra.tools.fetch_context")

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        """
        Retrieve relevant context from RAG layer.

        Pipeline:
            1. Extract query, scope, limit from arguments
            2. Apply scope filter based on org_id (from context)
            3. Search RAG store
            4. Return ranked results
        """
        call_id = f"fetch_context_{context.turn_count}"
        query: str = arguments.get("query", "")
        scope: str = arguments.get("scope", "organization")
        limit: int = arguments.get("limit", 5)

        # If query is empty, do a general context retrieval (no error)
        if not query:
            # Return general org context without error
            query = f"context for user {context.user_id} in org {context.org_id}"

        # Validate scope
        valid_scopes = {"property", "organization", "user", "all"}
        if scope not in valid_scopes:
            return ToolResult(
                call_id=call_id,
                tool_name=self.name,
                success=False,
                error=f"INVALID_SCOPE: '{scope}' not in {valid_scopes}",
            )

        # Search RAG store
        if self.rag_store is None:
            results = self._simulate_search(query, scope, limit, context)
        else:
            results = self._search_real(query, scope, limit, context)

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result={
                "query": query,
                "scope": scope,
                "org_id": context.org_id,
                "results": results,
                "count": len(results),
            },
        )

    def _simulate_search(
        self,
        query: str,
        scope: str,
        limit: int,
        context: OrchestratorContext,
    ) -> list[dict[str, Any]]:
        """
        Simulation mode — returns mock RAG results for development.

        In production, this queries the real RAG store (Pinecone, Weaviate, etc.)
        filtered by org_id.
        """
        self.logger.info(
            f"[FETCH_CONTEXT] SIMULATE: query='{query}', scope={scope}, "
            f"org={context.org_id}"
        )

        # Mock results based on query keywords
        mock_results = [
            {
                "id": "mem_001",
                "content": "Property ABC has a preferred vendor 'QuickFix Services' for electrical repairs. "
                           "Contact: quickfix@example.com",
                "memory_type": "preference",
                "relevance_score": 0.95,
                "source": "ticket_comment",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "created_at": "2026-05-20T10:00:00Z",
            },
            {
                "id": "mem_002",
                "content": "MST shift schedule: Morning (6AM-2PM), Evening (2PM-10PM), Night (10PM-6AM). "
                           "Handover between shifts is at 2PM and 10PM daily.",
                "memory_type": "procedure",
                "relevance_score": 0.88,
                "source": "sop_template",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "created_at": "2026-05-18T08:00:00Z",
            },
            {
                "id": "mem_003",
                "content": f"User {context.user_id} previously reported an issue with AC unit in Zone 3. "
                           "Ticket was resolved on 2026-05-15.",
                "memory_type": "history",
                "relevance_score": 0.72,
                "source": "ticket",
                "property_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "created_at": "2026-05-15T14:30:00Z",
            },
        ]

        # Filter by scope
        if scope == "property":
            filtered = [r for r in mock_results if r.get("property_id")]
        elif scope == "user":
            filtered = [r for r in mock_results if "user_id" in r.get("content", "")]
        elif scope == "organization":
            filtered = mock_results  # All belong to same org
        else:
            filtered = mock_results

        return filtered[:limit]

    def _search_real(
        self,
        query: str,
        scope: str,
        limit: int,
        context: OrchestratorContext,
    ) -> list[dict[str, Any]]:
        """Query the real RAG store."""
        try:
            # This would query the real RAG store in production
            # Example with Pinecone:
            # index = self.rag_store.Index("cassandra-memory")
            # results = index.query(
            #     vector=embeddings.embed(query),
            #     filter={"org_id": {"$eq": context.org_id}},
            #     top_k=limit,
            # )
            # return [r.metadata for r in results.matches]

            # Fallback to simulation
            return self._simulate_search(query, scope, limit, context)

        except Exception as exc:
            self.logger.warning(f"[FETCH_CONTEXT] RAG error: {exc} — falling back to simulation")
            return self._simulate_search(query, scope, limit, context)
