# SQL Engine v2 + FK Graph Architecture Plan
**Phase**: SQL Engine Re-Architecture
**Date**: 2026-06-04
**Status**: PLANNING

---

## Problem Statement

Current SQL Engine limitations:
1. **No JOIN support** - LLM generates single-table queries, can't cross-reference
2. **Hallucinated column names** - LLM guesses `tickets.created_by` instead of `tickets.raised_by`
3. **Wrong FK usage** - LLM invents relationships like `tickets.loc_id`
4. **No clarification on empty results** - "I don't have information" is false/misleading
5. **Linear prompts** - Rigid tool selection, no multi-step planning

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  USER MESSAGE: "energy spikes at SS Plaza"                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: INTENT DETECTION                                      │
│  - Extract entities: [energy_readings, properties]               │
│  - Detect query type: aggregation + filter + JOIN                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: FK SUBGRAPH INJECTION (Graphify)                      │
│  - Load FK graph from cassandra/config/fk_graph.json            │
│  - Inject only relevant relationships:                           │
│    "electricity_readings.property_id → properties.id"           │
│    "properties.name can filter with ILIKE"                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: SQL GENERATION (LLM with FK awareness)                 │
│  - System prompt includes JOIN Rulebook                          │
│  - Example: "To get property name for readings, JOIN using      │
│    property_id, not invented keys"                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: SQL GUARD (JOIN Verification)                         │
│  - Parse JOIN clauses                                            │
│  - Validate against FK graph                                     │
│  - Block invalid keys: "tickets.loc_id does not exist"         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 5: EXECUTION                                             │
│  - Hybrid: Python-side JOIN for multi-table                     │
│  - RPC for complex aggregations                                   │
│  - Single PostgREST for simple queries                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 6: RESPONSE SYNTHESIS                                    │
│  - If data found → Present with sources                         │
│  - If NO data → Offer alternatives (NOT "I don't know")        │
│  - Example: "No energy data for SS Plaza in June. Try:          │
│    1. Different time range? 2. Similar property name?            │
│    3. Check electricity_meters table exists?"                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Task 1: FK Graph (Machine-Readable Schema)

**File**: `cassandra/config/fk_graph.json`

```json
{
  "relationships": [
    {
      "from": "tickets",
      "from_col": "property_id",
      "to": "properties",
      "to_col": "id",
      "description": "Each ticket belongs to one property"
    },
    {
      "from": "tickets",
      "from_col": "raised_by",
      "to": "users",
      "to_col": "id",
      "description": "Ticket creator"
    },
    {
      "from": "tickets",
      "from_col": "assigned_to",
      "to": "users",
      "to_col": "id",
      "description": "Assigned staff member"
    },
    {
      "from": "electricity_readings",
      "from_col": "property_id",
      "to": "properties",
      "to_col": "id",
      "description": "Energy readings per property"
    },
    {
      "from": "mst_workload",
      "from_col": "user_id",
      "to": "users",
      "to_col": "id",
      "description": "MST workload stats"
    },
    {
      "from": "resolver_stats",
      "from_col": "user_id",
      "to": "users",
      "to_col": "id",
      "description": "Resolver performance"
    }
  ],
  "table_aliases": {
    "electricity_readings": ["energy", "electricity", "power", "kwh"],
    "tickets": ["issues", "complaints", "requests"],
    "properties": ["buildings", "sites", "locations"],
    "users": ["staff", "engineers", "technicians"]
  },
  "text_to_uuid_columns": {
    "property_name": {"table": "properties", "col": "name"},
    "user_email": {"table": "users", "col": "email"},
    "category_name": {"table": "issue_categories", "col": "name"}
  }
}
```

**Deliverable**: Populate from FMS DB schema with ALL known FK relationships

---

### Task 2: FK Graph Loader (Graphify)

**File**: `cassandra/tools/fk_graph.py`

```python
class FKGraph:
    """Loads FK relationships and provides subgraph retrieval."""

    def __init__(self, graph_path: str = "cassandra/config/fk_graph.json"):
        with open(graph_path) as f:
            data = json.load(f)
        self.relationships = data["relationships"]
        self.aliases = data.get("table_aliases", {})
        self.text_to_uuid = data.get("text_to_uuid_columns", {})

    def get_subgraph(self, entities: list[str]) -> dict:
        """Get only FK relationships relevant to the query entities."""
        relevant = []
        for rel in self.relationships:
            if rel["from"] in entities or rel["to"] in entities:
                relevant.append(rel)
        return {"relationships": relevant}

    def resolve_table(self, text: str) -> Optional[str]:
        """Resolve aliases to canonical table names."""
        text_lower = text.lower()
        for table, aliases in self.aliases.items():
            if text_lower in [table.lower()] + [a.lower() for a in aliases]:
                return table
        return None

    def validate_join(self, from_table: str, from_col: str, to_table: str, to_col: str) -> bool:
        """Check if a JOIN is valid per FK graph."""
        for rel in self.relationships:
            if (rel["from"] == from_table and rel["from_col"] == from_col and
                rel["to"] == to_table and rel["to_col"] == to_col):
                return True
        return False

    def get_join_hint(self, from_table: str, to_table: str) -> Optional[str]:
        """Get the correct FK to use for joining two tables."""
        for rel in self.relationships:
            if (rel["from"] == from_table and rel["to"] == to_table) or \
               (rel["from"] == to_table and rel["to"] == from_table):
                return f"Use {rel['from']}.{rel['from_col']} = {rel['to']}.{rel['to_col']}"
        return None
```

---

### Task 3: SQL Engine v2 (Hybrid Execution)

**File**: `cassandra/tools/sql_engine_v2.py`

**Features**:
1. **Schema validation** against FK graph
2. **Multi-table query planning** (detect when JOIN needed)
3. **Python-side JOIN** for multi-table queries
4. **RPC fallback** for complex aggregations

```python
class SQLEngineV2:
    """
    Schema-aware SQL engine with FK validation and multi-table support.
    """

    def __init__(self):
        self.fk_graph = FKGraph()

    def execute(self, query: str, context: dict) -> ToolResult:
        """
        Execute query with FK validation.

        1. Parse query for entities
        2. Validate JOINs against FK graph
        3. Execute via appropriate method
        """
        entities = self._extract_entities(query)
        subgraph = self.fk_graph.get_subgraph(entities)

        # Check for multi-table query
        if self._needs_join(query, subgraph):
            return self._execute_with_join(query, context, subgraph)
        else:
            return self._execute_single_table(query, context)

    def _validate_joins(self, query: str, subgraph: dict) -> tuple[bool, str]:
        """Validate all JOINs in query against FK graph."""
        join_pattern = r'(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)'
        for match in re.finditer(join_pattern, query):
            from_t, from_c, to_t, to_c = match.groups()
            if not self.fk_graph.validate_join(from_t, from_c, to_t, to_c):
                return False, f"INVALID_JOIN: {from_t}.{from_c} is not a valid foreign key"
        return True, ""

    def _execute_with_join(self, query: str, context: dict, subgraph: dict) -> ToolResult:
        """
        Execute multi-table query via Python-side JOIN.
        1. Parse query to identify tables and join columns
        2. Fetch each table separately via PostgREST
        3. Join in Python using pandas or manual merge
        """
        tables = self._extract_tables(query)
        join_col = self._extract_join_column(query, subgraph)

        # Fetch each table
        results = {}
        for table in tables:
            results[table] = self._fetch_table(table, context)

        # Python-side join
        joined = self._python_join(results, join_col)

        return ToolResult(
            tool_name="sql_query",
            success=True,
            data=joined,
            metadata={"tables": tables, "join_column": join_col}
        )
```

---

### Task 4: Clarification Response Layer

**Location**: `cassandra/llm/orchestrator.py`

**Logic**:

```python
def _handle_empty_results(self, tool_results: list[ToolResult], query: str, context: dict) -> str:
    """
    When queries return no data, offer alternatives instead of 'I don't know'.
    """
    # Analyze what was queried
    entities = self.fk_graph.extract_entities(query)

    # Generate helpful alternatives
    alternatives = [
        f"Try a different time range (e.g., last 30 days instead of this month)",
        f"Check similar property names (fuzzy search)",
        f"Verify data exists in {', '.join(entities)} table",
    ]

    # If we detected partial matches, suggest them
    partial = self._find_partial_matches(query, context)
    if partial:
        alternatives.insert(0, f"Did you mean: {partial}?")

    return f"I found no results for your query. Here's what you can try:\n" + \
           "\n".join(f"{i+1}. {alt}" for i, alt in enumerate(alternatives))
```

---

### Task 5: System Prompt Enhancement (JOIN Rulebook)

**File**: `cassandra/llm/openai_client.py`

**Add to SYSTEM_PROMPT**:

```
JOIN RULES (FMS Database):
- NEVER use invented column names. Always use verified FKs from the FK Graph.
- To get property name for any entity: JOIN via property_id
  Example: electricity_readings.property_id = properties.id
- To get user name: JOIN via raised_by or assigned_to to users.id
- To get category name: JOIN tickets.category_id = issue_categories.id
- CRITICAL: Use raised_by NOT created_by for tickets
- CRITICAL: Use user_photo_url NOT avatar_url for users

CORRECT → INVALID:
- tickets.created_by → tickets.raised_by
- users.avatar → users.user_photo_url
- tickets.category → tickets.category_id
```

---

### Task 6: SQL Guard Enhancement (JOIN Verification)

**File**: `cassandra/tools/sql_guard.py`

**Add validation**:

```python
def validate_joins(self, query: str, fk_graph: FKGraph) -> tuple[bool, str]:
    """
    Validate all JOINs in query against FK graph.
    """
    join_pattern = r'(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)'
    for match in re.finditer(join_pattern, query):
        from_t, from_c, to_t, to_c = match.groups()

        if not fk_graph.validate_join(from_t, from_c, to_t, to_c):
            # Provide helpful error with correct FK
            hint = fk_graph.get_join_hint(from_t, to_t)
            return False, f"INVALID_JOIN: {from_t}.{from_c} is not a valid foreign key. {hint or 'Check FK graph.'}"

    return True, ""
```

---

### Task 7: FK Graph Population Script

**File**: `cassandra/scripts/populate_fk_graph.py`

```python
"""
Script to extract FK relationships from FMS DB schema
and generate cassandra/config/fk_graph.json
"""

# Query information_schema for foreign keys
FK_QUERY = """
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public';
"""

def populate_fk_graph():
    """Extract FKs from DB and write to fk_graph.json"""
    # Execute FK_QUERY against FMS Supabase
    # Transform to FK graph format
    # Write to cassandra/config/fk_graph.json
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `cassandra/config/fk_graph.json` | CREATE | Machine-readable FK relationships |
| `cassandra/tools/fk_graph.py` | CREATE | FK Graph loader and validator |
| `cassandra/tools/sql_engine_v2.py` | CREATE | SQL Engine with JOIN support |
| `cassandra/llm/orchestrator.py` | UPDATE | Clarification on empty results |
| `cassandra/llm/openai_client.py` | UPDATE | JOIN Rulebook in prompt |
| `cassandra/tools/sql_guard.py` | UPDATE | JOIN validation |
| `cassandra/scripts/populate_fk_graph.py` | CREATE | FK extraction script |
| `CLAUDE.md` | UPDATE | FK usage rules |

---

## Hard Rules (CLAUDE.md)

```markdown
## Foreign Key Usage Rules

### NEVER (will be blocked by SQL Guard):
- ❌ `tickets.created_by` → use `tickets.raised_by`
- ❌ `users.avatar` → use `users.user_photo_url`
- ❌ `tickets.category` → use `tickets.category_id`
- ❌ Any JOIN without checking FK graph first
- ❌ Invented columns not in schema

### ALWAYS:
- ✅ Check `cassandra/config/fk_graph.json` before any JOIN
- ✅ Use FK graph for multi-table queries
- ✅ If FK not found, ask for clarification instead of guessing
```

---

## Testing Plan

1. **Unit tests**: FK graph loading, validation, subgraph retrieval
2. **Integration tests**: SQL Engine v2 with mock PostgREST
3. **E2E tests**:
   - "energy spikes at SS Plaza" → correct JOIN
   - "critical tickets by property" → correct FK usage
   - "show tickets with assignee names" → JOIN tickets + users
4. **Error injection**: Invalid JOIN → should return clear error

---

## Success Metrics

| Metric | Target |
|--------|--------|
| SQL generation with correct JOINs | 90%+ |
| FK validation catch rate | 100% |
| Clarification on empty results | 100% |
| "I don't have information" responses | 0 |
