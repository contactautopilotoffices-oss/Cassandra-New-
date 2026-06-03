# Claude Code Project Instructions

## SQL Query Generation Rules (CRITICAL)

**Before generating ANY SQL query, you MUST:**

1. **Read `SQL_QUERY_REFERENCE.md`** — This is the source of truth for all column names, table structures, and query templates.
2. **Validate column names** against the schema in that file
3. **Determine query scope based on user context**:
   - **Super Admin**: `property_id` is auto-injected by system (property selected in UI)
   - **Org Admin / Staff**: Use `organization_id` for org-wide queries
4. **Use correct date syntax**: `CURRENT_DATE - INTERVAL '1 day'` (NOT `CURDATE()` or `created_date`)

### Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `created_date` | `created_at` |
| `CURDATE()` | `CURRENT_DATE` |
| `category` (text) | `category_id` (UUID) |
| `created_by` | `raised_by` |
| `avatar_url` | `user_photo_url` |
| Status: `satisfied` | Status: `resolved` or `closed` |
| `organization_id` | `organization_id` (spell correctly) |

### Query Validation Checklist

Before executing a SQL query, verify:
- [ ] Table name exists in schema
- [ ] All column names match the schema exactly
- [ ] `organization_id` or `property_id` predicate included
- [ ] Date syntax is PostgreSQL-compatible
- [ ] Status values are from VALID_STATUS list

---

## Key Files

- `FMS DB Schema .md` — Full database schema
- `SQL_QUERY_REFERENCE.md` — Query templates and column mapping
- `SCHEMA_AUDIT.md` — Known mismatches between mobile and web schemas
- `cassandra/tools/fms_schema.py` — Python schema module (for sql_engine.py)

---

## Connection Stability

If connection issues occur:
1. Check `curl http://localhost:3001/health` returns 200 OK
2. Verify Supabase credentials in environment
3. Check SQL Guard logs for rejected queries

---

*Updated: 2026-06-01*
