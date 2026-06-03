# Mobile Auth Architecture — Verified Implementation
> Ingested into NotebookLM — source of truth for auth flow
> Generated: 2026-05-29

---

## Auth Context (Primary — in use)

**File:** `saas_mobile_app/context/AuthContext.tsx`

### State Shape
```typescript
interface AuthContextType {
  user: AuthUser | null;           // Enriched Supabase User
  session: Session | null;         // Supabase Session
  isLoading: boolean;
  membership: UserMembership | null;
  isMembershipLoading: boolean;
  signIn: (email, password) => Promise<{ data, error }>;
  signUp: (email, password, fullName) => Promise<{ user, session, error }>;
  signOut: () => Promise<void>;
  resetPassword: (email) => Promise<void>;
  refreshMembership: () => Promise<void>;
}

type AuthUser = User & {
  name?: string;
  avatar?: string;
  full_name?: string;
};

interface UserMembership {
  org_id: string | null;
  org_name: string | null;
  org_role: string | null;
  properties: PropertyInfo[];
}

interface PropertyInfo {
  id: string;
  name: string;
  code: string;
  role: string;
  image_url?: string | null;
}
```

### Auth Flow (Step-by-Step)

```
1. App mounts
   ↓
2. AuthContext.useEffect → supabase.auth.getSession()
   ↓
3. If session exists:
   a. setSession(session)
   b. setUser(enrichUser(user))
   c. fetchMembership(user.id)
   d. getValidToken() [pre-warm - non-fatal]
   ↓
4. supabase.auth.onAuthStateChange subscription
   → SIGNED_IN: fetchMembership + getValidToken()
   → SIGNED_OUT: setMembership(null) + clearToken()
```

### Membership Fetch Flow
```
fetchMembership(userId)
  ├── Load cached membership (24h TTL)
  │   └── Fast path: return if fresh
  ├── Fetch organization_memberships
  │   └── Filter: is_active = true OR is_active IS NULL
  ├── Fetch property_memberships
  │   └── Filter: is_active = true OR is_active IS NULL
  ├── If org_admin (org_super_admin | org_admin | owner):
  │   └── Fetch ALL properties for org
  │   └── Merge with existing properties
  ├── Persist to AsyncStorage (24h TTL)
  └── Return UserMembership
```

### Cache Keys
- Membership: `@autopilot_membership:{userId}` → AsyncStorage
- TTL: 24 hours
- Cassandra token: `cassandra_token` → SecureStore

---

## Cassandra Auth Service (Two-Layer)

**File:** `saas_mobile_app/services/cassandra/cassandraAuthService.ts`

### Layer 1: REST Token Exchange
```typescript
async function exchangeToken(supabaseToken: string): Promise<SessionResponse> {
  const response = await fetch(`${CASSANDRA_API_URL}/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: supabaseToken }),
  });
  return response.json();
}
```

### Token Management
```typescript
export async function getValidToken(): Promise<string> {
  // 1. Check if cached token is valid (with 5-min buffer)
  // 2. If expired: re-exchange via exchangeToken()
  // 3. Cache to SecureStore
  // 4. Return token
}

export async function withTokenRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  // 1. Get valid token
  // 2. Execute fn(token)
  // 3. On 401: clear cache + retry once
  // 4. Return result
}
```

### WebSocket URL
```typescript
export function getWebSocketUrl(orgId: string): string {
  return `wss://${CASSANDRA_HOST}/ws/cassandra?org_id=${orgId}`;
}
```

---

## Key Non-Negotiables

1. **Always pre-warm Cassandra token** on `SIGNED_IN`
2. **Always clear Cassandra token** on `SIGNED_OUT`
3. **Always use 24h membership cache** (not 5 minutes)
4. **Always check `user_photo_url`** — never `avatar_url`
5. **Always include org predicate** in Supabase queries
