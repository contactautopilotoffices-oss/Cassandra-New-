# Simple Auth Plan — Using Membership ID

## Problem Statement

Current auth is over-engineered with:
- JWT verification (JWKS + HS256 + base64 decoding)
- Token refresh chains
- Separate org_id + property_id validation
- Complex error handling

**Issue**: Sometimes org_id sent but property_id missing, or vice versa.

## Solution: Membership ID as Single Source of Truth

```
property_memberships table:
┌─────────────────────────────────────────────────────────────┐
│ user_id | organization_id | property_id | role | created_at │
├─────────────────────────────────────────────────────────────┤
│   A     │       X          |     Y       | admin |    ...   │
└─────────────────────────────────────────────────────────────┘
       ↑                    ↑            ↑
       │                    │            │
   This is what         AND this    AND this
   we need to validate are NOW VALID
```

**One ID validates everything.**

---

## New Simple Auth Flow

```
Mobile (already logged in via Supabase)
    │
    ▼
POST /cassandra/session { user_id, property_id }  ← Simple
    │
    ▼
Server validates property_memberships:
  ✓ user_id exists
  ✓ property_id exists
  ✓ user belongs to property
  ✓ extract organization_id from the membership
    │
    ▼
Returns: { session_token, org_id, property_id }  ← Done
    │
    ▼
All subsequent /chat calls just use session_token
No JWT, no complex validation
```

---

## Implementation Steps

### Phase 1: Add Simple Session Endpoint

**New endpoint**: `POST /cassandra/session`

```python
@app.post("/cassandra/session")
async def create_simple_session(request: SimpleSessionRequest):
    """
    Simple session creation using property_memberships.
    No JWT verification - assumes mobile already authenticated with Supabase.
    """
    user_id = request.user_id
    property_id = request.property_id

    # Validate membership exists
    result = await validate_membership(user_id, property_id)
    if not result:
        raise HTTPException(401, "Invalid membership")

    # Extract org_id from membership
    org_id = result["organization_id"]

    # Issue simple session token (just encodes the IDs)
    session_token = encode_session_token(user_id, org_id, property_id)

    return {
        "session_token": session_token,
        "org_id": org_id,
        "property_id": property_id,
        "expires_at": time.time() + 21600  # 6 hours
    }
```

### Phase 2: Update /chat Endpoint to Use Simple Auth

```python
@app.post("/chat")
async def chat(request: StreamChatRequest, fastapi_request: Request):
    """
    Updated to use simple session token.
    """
    auth_header = fastapi_request.headers.get("authorization", "")
    session_token = auth_header.replace("Bearer ", "").strip()

    # Decode session - extracts org_id and property_id
    session = decode_session_token(session_token)

    org_id = session["org_id"]
    property_id = session["property_id"]
    user_id = session["user_id"]

    # Continue with LLM orchestrator...
```

### Phase 3: Keep Existing JWT Flow for Backward Compatibility

- Keep `/auth/session` for web/clients that use Supabase JWT
- New `/cassandra/session` for simpler mobile flow
- Eventually migrate all clients to simple flow

---

## Database Query

```sql
-- Validate membership and get org_id
SELECT
    pm.user_id,
    pm.organization_id,
    pm.property_id,
    pm.role,
    o.name as org_name,
    p.name as property_name
FROM property_memberships pm
JOIN organizations o ON pm.organization_id = o.id
JOIN properties p ON pm.property_id = p.id
WHERE pm.user_id = :user_id
  AND pm.property_id = :property_id
LIMIT 1;
```

---

## Files to Modify

| File | Change |
|-------|--------|
| `api_server.py` | Add `/cassandra/session` endpoint |
| `api_server.py` | Add `validate_membership()` function |
| `api_server.py` | Update `/chat` to accept simple session token |
| `api_server.py` | Add `encode_session_token()` / `decode_session_token()` |
| `AuthContext.tsx` (mobile) | Update to use new session endpoint |
| `cassandraAuthService.ts` | Update to call new endpoint |

---

## Migration Path

1. **Week 1**: Add `/cassandra/session` alongside existing `/auth/session`
2. **Week 2**: Update mobile app to use new endpoint
3. **Week 3**: Deprecate complex JWT flow
4. **Week 4**: Remove old JWT code (optional)

---

## Benefits

| Before | After |
|--------|-------|
| JWT verification | Simple token encode/decode |
| JWKS + HS256 | Just validate membership exists |
| Supabase org lookup | Already in membership record |
| Complex error handling | "Invalid membership" or "Valid" |
| Token refresh chains | Just re-create session |
| Base64 secret decoding | N/A |

---

## Code Complexity

| Metric | Before | After |
|--------|--------|-------|
| Auth code lines | ~200 | ~50 |
| Token types | 2 (Supabase + Cassandra) | 1 (Cassandra session) |
| External calls | 2-3 (JWKS + Supabase) | 1 (validate membership) |
| Error types | 10+ | 3 (invalid, expired, valid) |

---

## Next Steps (for approval)

1. Create `/cassandra/session` endpoint
2. Add `validate_membership()` function
3. Test simple auth flow
4. Update mobile app
5. Deprecate old JWT flow

---

*Plan created: 2026-06-01*
