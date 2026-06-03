# saas_mobile ↔ saas_one Schema Audit

> Generated from analysis of `saas_development/saas_one` (web) vs `saas_mobile` (mobile)

---

## Executive Summary

The mobile app references **~35+ tables** directly via Supabase. Many have **column name mismatches** or **expect tables that don't exist** in the saas_one schema. The most reliable fix is to route mobile data operations through the saas_one **web APIs** (which already handle auth, validation, RLS, and business logic) instead of direct Supabase queries.

---

## Critical Mismatches by Domain

### 1. TICKETS (Highest Impact)

| Mobile expects | saas_one actual | Status |
|----------------|-----------------|--------|
| `tickets.internal` | `tickets.is_internal` | **BROKEN** |
| `tickets.created_by` | `tickets.raised_by` | **BROKEN** (created_by added later but not primary) |
| `tickets.before_photo` | `tickets.photo_before_url` | **BROKEN** |
| `tickets.after_photo` | `tickets.photo_after_url` | **BROKEN** |
| `tickets.category` (text) | `tickets.category_id` (UUID → issue_categories) | **BROKEN** |
| Status: `satisfied` | Not in schema | **BROKEN** |
| Status: `paused` | Not in schema | **BROKEN** |
| Status: `pending_validation` | Not in schema | **BROKEN** |
| `ticket_comments.content` | `ticket_comments.comment` | **BROKEN** |
| `ticket_comments.user:users(avatar_url)` | `users.user_photo_url` | **BROKEN** |
| `ticket_escalation_logs.escalated_to` | `ticket_escalation_logs.to_employee_id` | **BROKEN** |
| `material_requests` table | **Does not exist** | **BROKEN** |
| `property_features` table | **Does not exist** | **BROKEN** |

**Fix strategy:** Route all ticket operations through web API (`/api/tickets/*`) instead of direct Supabase.

---

### 2. MEETING ROOMS (Fixed in this session)

| Mobile expected | saas_one actual | Status |
|-----------------|-----------------|--------|
| `meeting_rooms.description` | `meeting_rooms.location` | **FIXED** |
| `meeting_room_bookings.room_id` | `meeting_room_bookings.meeting_room_id` | **FIXED** |
| `meeting_room_bookings.tenant_id` | `meeting_room_bookings.user_id` | **FIXED** |
| `meeting_room_credits.tenant_id` | `meeting_room_credits.user_id` | **FIXED** |
| `meeting_room_credits.balance_hours` | `meeting_room_credits.remaining_hours` | **FIXED** |
| Used wrong Supabase client | Uses `@/utils/supabase/client` | **FIXED** |

---

### 3. VISITOR MANAGEMENT (VMS)

| Mobile expects | saas_one actual | Status |
|----------------|-----------------|--------|
| `visitor_logs.visitor_name` | `visitor_logs.name` | **BROKEN** |
| `visitor_logs.email` | **Does not exist** | **BROKEN** |
| `visitor_logs.company` | **Does not exist** | **BROKEN** |
| `visitor_logs.purpose` | **Does not exist** | **BROKEN** |
| `visitor_logs.host_id` | **Does not exist** | **BROKEN** |
| `visitor_logs.expected_date` | **Does not exist** | **BROKEN** |
| `visitor_logs.expected_time` | **Does not exist** | **BROKEN** |
| `visitor_logs.pass_code` | **Does not exist** | **BROKEN** |
| `visitor_logs.vehicle_number` | **Does not exist** | **BROKEN** |
| `visitor_logs.belongings` | **Does not exist** | **BROKEN** |
| `visitor_logs.pre_registered` | **Does not exist** | **BROKEN** |
| `visitor_logs.whom_to_meet_uid` | **Does not exist** | **BROKEN** |

**Fix strategy:** Use web API `/api/vms/[propertyId]` which handles visitor check-in/check-out.

---

### 4. STOCK / INVENTORY

| Mobile expects | saas_one actual | Status |
|----------------|-----------------|--------|
| `stock_items.min_quantity` | `stock_items.min_threshold` | **BROKEN** |
| `stock_items.max_quantity` | **Does not exist** | **BROKEN** |
| `stock_items.cost_per_unit` | **Does not exist** | **BROKEN** |
| `stock_items.qr_code_data` | **Does not exist** | **BROKEN** |
| `stock_movements.performed_by` | **Does not exist** (has `user_id`) | **BROKEN** |

---

### 5. SOP / CHECKLIST

| Mobile expects | saas_one actual | Status |
|----------------|-----------------|--------|
| `sop_step_results` table | **Does not exist** | **BROKEN** |
| `sop_completion_items` table | **Does not exist** | **BROKEN** |
| `sop_templates.assigned_roles` | `sop_templates.assigned_to` (text[]) | **MISMATCH** |
| `sop_templates.qr_code` | **Does not exist** | **BROKEN** |
| `sop_checklist_items.order` | `sop_checklist_items.order_index` | **BROKEN** |
| `sop_checklist_items.requires_signature` | **Does not exist** | **BROKEN** |
| `sop_completions.started_by` | **Does not exist** | **BROKEN** |
| `sop_completions.started_at` | **Does not exist** | **BROKEN** |

---

### 6. USERS / AUTH

| Mobile expects | saas_one actual | Status |
|----------------|-----------------|--------|
| `users.avatar_url` | `users.user_photo_url` | **BROKEN** |
| `users.role` | On `property_memberships` / `organization_memberships` | **BROKEN** |
| `users.organization_id` | On `organization_memberships` | **BROKEN** |
| `users.property_id` | On `property_memberships` | **BROKEN** |

---

### 7. NOTIFICATIONS

**Two competing schemas in saas_one:**
- `20260202_create_notifications.sql`: `type`, `recipient_role`, `recipient_id`, `title`, `body`, `entity_id`, `timestamp`, `read`
- `20260205_notification_system.sql`: `user_id`, `ticket_id`, `property_id`, `organization_id`, `notification_type`, `title`, `message`, `deep_link`, `is_read`, `created_at`

Mobile uses: `user_id`, `is_read`, `created_at`, `type`, `title`, `message`, `deep_link`, `status`

**Issues:**
- Mobile uses `status` column → not in either schema
- Mobile uses `type` → 20260205 uses `notification_type`

---

### 8. TABLES THAT DON'T EXIST IN saas_one

| Mobile table | Used in | What saas_one has instead |
|--------------|---------|---------------------------|
| `material_requests` | Ticket detail | Nothing equivalent |
| `property_features` | Flow map, tickets | `organizations.available_modules` (text[]) |
| `sop_step_results` | SOP service | Nothing equivalent |
| `sop_completion_items` | Checklist screen | Nothing equivalent |
| `amc_contracts` | PPM screen | Nothing equivalent |
| `shift_logs` | Dashboards | Nothing equivalent |
| `mst_daily_scores` | Dashboards | Nothing equivalent |
| `system_config` | Mobile services | Nothing equivalent |
| `push_tokens` | Push notifications | Nothing equivalent |
| `snag_imports` | Reports | Nothing equivalent |
| `user_voice_embeddings` | Voice enrollment | Nothing equivalent |

---

## Recommended Fix Strategy

### Option A: Route Everything Through Web APIs (RECOMMENDED)
Instead of fixing every direct Supabase query, add API wrappers in `mobileApi.ts` for all saas_one endpoints:

```
GET    /api/tickets?propertyId=...
POST   /api/tickets
GET    /api/tickets/[id]
POST   /api/tickets/[id]/comments
GET    /api/meeting-rooms?propertyId=...
GET    /api/vms/[propertyId]
POST   /api/vms/[propertyId]
GET    /api/properties/[propertyId]/stock/items
...etc
```

**Pros:**
- Single source of truth (web API handles all validation, RLS, business logic)
- No schema drift between mobile and web
- Credit checks, overlap validation, notifications all handled server-side

**Cons:**
- Requires network connectivity for all operations
- Need to add Bearer token auth to all calls

### Option B: Fix Direct Supabase Queries
Update every mobile file to use correct column names. This is high-effort and will drift again.

---

## Web APIs Already Available in saas_one

These APIs exist and can be used from mobile immediately:

| Domain | API Routes |
|--------|-----------|
| Tickets | `/api/tickets`, `/api/tickets/[id]`, `/api/tickets/[id]/comments`, `/api/tickets/[id]/assign`, `/api/tickets/update-status` |
| Meeting Rooms | `/api/meeting-rooms`, `/api/meeting-room-bookings`, `/api/meeting-room-credits` |
| Visitors | `/api/vms/[propertyId]` |
| Users | `/api/users/list`, `/api/users/create`, `/api/users/update-role` |
| Diesel | `/api/properties/[propertyId]/diesel-readings` |
| Electricity | `/api/properties/[propertyId]/electricity-readings` |
| Stock | `/api/properties/[propertyId]/stock/items` |
| SOP | `/api/properties/[propertyId]/sop/templates`, `/api/properties/[propertyId]/sop/completions` |
| PPM | `/api/ppm/schedules` |
| Reports | `/api/reports/requests-report`, `/api/reports/snag-report/[importId]` |

---

## Quick Wins (Fix These First)

1. **Tickets `internal` → `is_internal`** — affects every ticket list query
2. **Tickets `before_photo`/`after_photo` → `photo_before_url`/`photo_after_url`** — affects ticket detail
3. **Tickets `created_by` → `raised_by`** — affects ticket service
4. **Users `avatar_url` → `user_photo_url`** — affects comments, profiles
5. **Visitor columns** — map mobile field names to actual schema or switch to VMS API
6. **Stock `min_quantity` → `min_threshold`**
7. **SOP `order` → `order_index`**
