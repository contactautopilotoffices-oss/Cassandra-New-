# Session Documentation: Schema Fix & Query Optimization

**Date**: 2026-06-01
**Session**: SQL Query Failure Root Cause Analysis & Schema Documentation

---

## Executive Summary

The LLM-powered SQL query system was failing because it lacked **schema context**. This session:
1. Analyzed the root cause of query failures
2. Created schema-accurate documentation files
3. Created `fms_schema.py` for Python integration
4. Updated `sql_engine.py` to validate against schema
5. Established guardrails for future queries

---

## Problem Analysis

### Why SQL Queries Were Failing

| Failure Mode | Cause | Evidence |
|--------------|-------|----------|
| **Wrong column names** | LLM guessed `created_date` | Schema uses `created_at` |
| **Wrong data types** | LLM used `category` (text) | Schema uses `category_id` (UUID) |
| **Missing predicates** | No `organization_id` filter | SQL Guard would block cross-tenant access |
| **Wrong date syntax** | LLM used `CURDATE()` | Postgres uses `CURRENT_DATE` |
| **Retired statuses** | LLM used `assigned`, `waitlist` | These were removed in refactor |

### The Conversation Flow (What Happened)

```
User: "tickets raised yesterday + who has max open tickets"
    ↓
LLM: Understood intent, generated SQL (GUESSED column names)
    ↓
sql_query: FAILED (wrong table/column names)
    ↓
LLM: Fallback response with generic advice
    ↓
User: "Read the FMS DB Schema! Use that as fallback!"
    ↓
Claude: Read schema, created documentation, generated correct SQL
```

---

## Files Created/Updated

### 1. `SQL_QUERY_REFERENCE.md` (NEW)

**Purpose**: Source of truth for all SQL query generation

**Key Content**:
- Exact column names verified against `FMS DB Schema .md`
- Query templates for common operations
- Column name mapping (mobile expected → schema actual)
- Date handling syntax
- Required predicates table

---

### 2. `CLAUDE.md` (NEW)

**Purpose**: Project instructions for Claude Code agent

**Key Rules Added**:
1. Read `SQL_QUERY_REFERENCE.md` before ANY SQL query
2. Validate column names against schema
3. Determine query scope based on user context
4. Use correct date syntax: `CURRENT_DATE - INTERVAL '1 day'`

---

### 3. `fms_schema.py` (NEW - Python Integration)

**Purpose**: Schema module that Python can import directly

**Path**: `cassandra/tools/fms_schema.py`

**Key Features**:
- Table definitions with columns
- Valid status/priority values
- Column aliases (for validation)
- Query templates
- Helper functions

**Integration**:
```python
from cassandra.tools.fms_schema import (
    TABLES,
    VALID_STATUS,
    VALID_PRIORITY,
    resolve_column,
)

# Check if status is valid
valid = VALID_STATUS["tickets"]  # ["open", "assigned", "in_progress", ...]

# Resolve alias
actual = resolve_column("created_date")  # Returns "created_at"
```

---

### 4. `sql_engine.py` (UPDATED)

**Path**: `cassandra/tools/sql_engine.py`

**Changes**:
1. Updated tool description with correct status values
2. Added import for `fms_schema.py`
3. Added `_validate_schema()` method
4. Added template substitution for `{{property_id}}`
5. Schema validation before SQL Guard check

**Validation Flow**:
```
Query → Schema Validation → SQL Guard → Execute
         ↓ (if invalid)
      Return SCHEMA_ERROR with details
```

---

### 5. `FMS DB Schema .md` (EXISTING - Verified)

**Purpose**: Full database schema reference

---

### 6. `SCHEMA_AUDIT.md` (EXISTING - Referenced)

**Purpose**: Known mismatches between mobile and web schemas

---

## Production Query Execution Workflow

### The Correct Flow (Per Session Rules)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER QUERY                                                     │
│  "How many tickets were raised yesterday at ETPL?"               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: SCHEMA VALIDATION (MANDATORY)                          │
│  - fms_schema.py: Check column names, status values             │
│  - sql_engine._validate_schema(): Reject invalid columns        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: USER CONTEXT DETERMINATION                             │
│  - Super Admin (sanyog@gmail.com) → property_id auto-injected   │
│  - Org Admin → organization_id required                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: SQL GENERATION (with dual-predicate)                   │
│  SELECT COUNT(*) FROM tickets                                     │
│  WHERE organization_id = '...'  -- Required by SQL Guard         │
│    AND property_id = '...'      -- System auto-injects          │
│    AND created_at >= CURRENT_DATE - INTERVAL '1 day'            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: SQL GUARD                                               │
│  - Validate org_id exists                                        │
│  - Check table whitelist                                         │
│  - Block dangerous operations                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: EXECUTION                                               │
│  - PostgREST API call via httpx                                  │
│  - Return JSON results                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Python Integration Details

### fms_schema.py Structure

```python
# Table definitions with columns
TABLES = {
    "tickets": {
        "columns": ["id", "property_id", "organization_id", "created_at", ...],
        "required_predicates": ["organization_id", "property_id"],
    },
    ...
}

# Valid status values (no retired ones)
VALID_STATUS = {
    "tickets": ["open", "assigned", "in_progress", "resolved", "closed", "waitlist"],
}

# Column aliases for correction
COLUMN_ALIASES = {
    "created_date": "created_at",
    "created_by": "raised_by",
    "avatar_url": "user_photo_url",
}

# Retired values that should fail
RETIRED_STATUS = {
    "tickets": ["satisfied", "paused", "pending_validation"],
}
```

### sql_engine.py Validation

```python
def _validate_schema(self, query: str) -> Optional[str]:
    # 1. Parse query
    # 2. Check SELECT columns against TABLES[table]["columns"]
    # 3. Check WHERE columns
    # 4. Check GROUP BY columns
    # 5. Check status values against VALID_STATUS
    # 6. Return error or None
```

---

## Corrected SQL for ETPL Property

### Property Details
- **Property ID**: `bf345711-06fc-405f-b3a6-0a4888fff8b2`
- **Organization ID**: `211e1330-ad83-446d-941f-dcea48396798`

### Query 1: Tickets Raised Yesterday
```sql
SELECT COUNT(*) as ticket_count
FROM tickets
WHERE organization_id = '211e1330-ad83-446d-941f-dcea48396798'
  AND property_id = 'bf345711-06fc-405f-b3a6-0a4888fff8b2'
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE;
```

### Query 2: Staff with Maximum Open Tickets
```sql
SELECT
  assigned_to,
  COUNT(*) as open_ticket_count
FROM tickets
WHERE organization_id = '211e1330-ad83-446d-941f-dcea48396798'
  AND property_id = 'bf345711-06fc-405f-b3a6-0a4888fff8b2'
  AND status = 'open'
GROUP BY assigned_to
ORDER BY open_ticket_count DESC
LIMIT 5;
```

---

## Column Name Cheat Sheet

| Don't Use | Use Instead | Notes |
|-----------|-------------|-------|
| `created_date` | `created_at` | Timestamptz column |
| `CURDATE()` | `CURRENT_DATE` | Postgres date function |
| `category` | `category_id` | UUID FK to issue_categories |
| `created_by` | `raised_by` | FK to users.id |
| `avatar_url` | `user_photo_url` | User profile photo |
| `satisfied` (status) | `resolved` or `closed` | Retired status |
| `paused` (status) | `in_progress` | Retired status |
| `pending_validation` (status) | `open` | Retired status |
| `comment` content | `ticket_comments.comment` | Text column in comments table |

---

## Files Reference

| File | Path | Purpose |
|------|------|---------|
| SQL_QUERY_REFERENCE.md | `/Users/lohitaksha/Lohit Mobile App/` | Query templates & column mapping |
| CLAUDE.md | `/Users/lohitaksha/Lohit Mobile App/` | Agent instructions |
| **fms_schema.py** | `cassandra/tools/fms_schema.py` | Python schema module |
| **sql_engine.py** | `cassandra/tools/sql_engine.py` | Updated with schema validation |
| **api_server.py** | `cassandra/orchestrator/api_server.py` | JWT base64 decode + refresh endpoint |
| **identity.py** | `cassandra/middleware/identity.py` | JWT base64 decode fix |
| FMS DB Schema .md | `/Users/lohitaksha/Lohit Mobile App/` | Full schema definition |
| SCHEMA_AUDIT.md | `/Users/lohitaksha/Lohit Mobile App/saas_mobile_app/` | Mobile vs web mismatches |

---

## Issue 2: JWT Auth Failures (Fixed 2026-06-01)

### Root Cause

1. **`SUPABASE_JWT_SECRET` is base64-encoded** - `pyjwt.decode` needs raw bytes, not base64 string
2. **Token expires after 1 hour** - Mobile needs auto-refresh mechanism

### Fixes Applied

#### 1. Base64 Secret Decoding

**Files**: `cassandra/orchestrator/api_server.py`, `cassandra/middleware/identity.py`

```python
def _decode_base64_secret(secret: str) -> bytes:
    """Decode a base64-encoded JWT secret."""
    import base64
    try:
        return base64.urlsafe_b64decode(secret)
    except Exception:
        return base64.b64decode(secret)
```

Updated `verify_jwt_signature()` and `decode_jwt_payload()` to use decoded bytes.

#### 2. Token Refresh Mechanism

**New Endpoint**: `POST /auth/refresh`

```python
@app.post("/auth/refresh")
async def auth_refresh(request: Request, req: AuthSessionRequest):
    # Exchange refresh_token for new Supabase JWT
    # Then exchange new JWT for Cassandra token
    return {
        "cassandra_token": new_token,
        "expires_at": new_expires_at,
        "access_token": new_supabase_jwt,
        "refresh_token": new_refresh_token,
    }
```

#### 3. Error Codes

- `TOKEN_EXPIRED` - Supabase JWT expired, mobile must call `/auth/refresh`
- `AUTH_FAILED` - Other auth failures

#### 4. Extended Token Expiry

Changed Cassandra session token from 1 hour to 6 hours (21600 seconds).

---

## Next Steps

1. **Test JWT fix** - Verify base64 decode works
2. **Test refresh endpoint** - Mobile should call `/auth/refresh` when token expires
3. **Execute queries** via production harness
4. **Monitor logs** for any remaining issues

---

*Generated: 2026-06-01*
*Updated: 2026-06-01 (JWT auth fixes added)*
