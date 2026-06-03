# SQL Query Reference (Schema-Accurate)

> **CRITICAL**: Always use this file as the source of truth for SQL queries.
> LLM must validate column names against this document before generating SQL.

---

## Core Tables

### `tickets` (PRIMARY TABLE FOR TICKET QUERIES)

```sql
CREATE TABLE tickets (
  id uuid PRIMARY KEY,
  ticket_number text UNIQUE NOT NULL,     -- Format: TKT-PROP-00001
  property_id uuid NOT NULL REFERENCES properties(id),
  organization_id uuid NOT NULL,           -- REQUIRED PREDICATE for ALL queries
  category_id uuid REFERENCES issue_categories(id),  -- UUID, NOT text
  skill_group_id uuid REFERENCES skill_groups(id),
  title text NOT NULL,
  description text,
  location text,                          -- Unit/floor/area
  priority text DEFAULT 'medium',          -- 'low' | 'medium' | 'high' | 'urgent' | 'critical'
  status text DEFAULT 'open',              -- 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'waitlist'
  raised_by uuid REFERENCES users(id),    -- NOT created_by
  assigned_to uuid REFERENCES users(id),
  assigned_at timestamptz,
  sla_hours integer,
  sla_deadline timestamptz,
  sla_started boolean DEFAULT false,
  sla_breached boolean DEFAULT false,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),   -- NOT created_date
  updated_at timestamptz DEFAULT now()
);
```

**Valid Status Values**: `open`, `assigned`, `in_progress`, `resolved`, `closed`, `waitlist`

> ⚠️ **DO NOT USE**: `satisfied`, `paused`, `pending_validation` - these don't exist in schema

### `ticket_comments`

```sql
CREATE TABLE ticket_comments (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  user_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL,                  -- Column is 'comment' NOT 'content'
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

### `users`

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,                -- Display name
  email text UNIQUE NOT NULL,
  user_photo_url text,                    -- NOT avatar_url
  created_at timestamptz DEFAULT now()
);
```

---

## Common Query Templates

### 1. Count of tickets raised yesterday (for a property) — SUPER ADMIN

```sql
SELECT COUNT(*) as ticket_count
FROM tickets
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE
  AND property_id = :property_id;  -- System auto-injects for Super Admin
```

### 2. Count of tickets raised yesterday (for an organization) — ORG ADMIN

```sql
SELECT COUNT(*) as ticket_count
FROM tickets
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE
  AND organization_id = :organization_id;
```

### 3. Staff member with maximum open tickets (property-scoped) — SUPER ADMIN

```sql
SELECT 
  u.id,
  u.full_name,
  COUNT(t.id) as open_ticket_count
FROM tickets t
JOIN users u ON t.assigned_to = u.id
WHERE t.status = 'open'
  AND t.property_id = :property_id
GROUP BY u.id, u.full_name
ORDER BY open_ticket_count DESC
LIMIT 1;
```

### 4. Staff member with maximum open tickets (org-wide) — ORG ADMIN

```sql
SELECT 
  u.id,
  u.full_name,
  COUNT(t.id) as open_ticket_count
FROM tickets t
JOIN users u ON t.assigned_to = u.id
WHERE t.status = 'open'
  AND t.organization_id = :organization_id
GROUP BY u.id, u.full_name
ORDER BY open_ticket_count DESC
LIMIT 1;
```

---

## Column Name Mapping (Mobile → Schema)

| Mobile Expected | Schema Actual | Notes |
|-----------------|---------------|-------|
| `tickets.created_by` | `tickets.raised_by` | FK to users |
| `tickets.category` | `tickets.category_id` | UUID FK to issue_categories |
| `tickets.internal` | Does not exist | Use `ticket_comments.is_internal` instead |
| `ticket_comments.content` | `ticket_comments.comment` | Text field |
| `users.avatar_url` | `users.user_photo_url` | Photo URL |

---

## Required Predicates

**ALWAYS include these predicates**:

| Table | Required Predicate |
|-------|-------------------|
| `tickets` | `organization_id = :org_id` AND/OR `property_id = :property_id` |
| `ticket_comments` | Join through `tickets` table |
| `users` | Usually via JOIN from tickets |
| `properties` | `organization_id = :org_id` |

---

## Date Handling

| Requirement | Correct Syntax |
|-------------|---------------|
| Yesterday | `CURRENT_DATE - INTERVAL '1 day'` |
| Last 7 days | `CURRENT_DATE - INTERVAL '7 days'` |
| Date range | `WHERE created_at >= :start AND created_at < :end` |

> ⚠️ **DO NOT USE**: `created_date` column (doesn't exist), `CURDATE()` (Postgres syntax is `CURRENT_DATE`)

---

## Retired Status Values (DO NOT USE)

| Retired Status | Use Instead |
|----------------|------------|
| `satisfied` | `resolved` or `closed` |
| `paused` | `in_progress` |
| `pending_validation` | `open` |

---

*Updated: 2026-06-01*
