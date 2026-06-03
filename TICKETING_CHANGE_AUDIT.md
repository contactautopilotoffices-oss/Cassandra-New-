# Ticketing Module Change Audit

*Last updated: 2026-06-01*

---

## 1. Executive Summary

### What Changed
The Ticketing Module has a **split implementation status**:

1. **Backend (`saas_mobileApp_server`)**: Fully migrated to dedicated `/api/tickets` REST endpoints with advanced filtering, AI classification, activity logging, material request integration, and dashboard cache invalidation.
2. **Mobile (`saas_mobile_app`)**: **Partially migrated**. New ticket creation and listing flow through `mobileApi.ts` → `/api/tickets`. However, ticket detail fetching, updates, comments, and status changes still use direct Supabase queries or legacy `serverApi.query` mutations. The `ticketService.ts` file remains on direct Supabase and has **not** been refactored to use the backend REST API.

The update introduces extended type definitions (`types/ticketing.ts`), SLA pause fields in the schema, Material Requests integration in the ticket detail view, and a UI refresh. Real-time WebSocket subscriptions are still active in the mobile app.

### Why It Changed
- **Business Reason**: To improve security and business logic encapsulation by moving away from generic client-side `serverApi.query` DB mutations to controlled `/api/tickets` endpoints.
- **Feature Expansion**: To support complex workflows like SLA Management and Material Procurement without bloated client-side logic.

### Benefits
- **Developer Experience**: Extended type interfaces (`types/ticketing.ts`) replace `any` and placeholder types for new fields.
- **UX**: Material Requests view, Ticket Editing (inline), and SLA Pausing provide a richer management experience directly from mobile.
- **Architecture**: The backend is now fully decoupled from the database schema. The mobile app is partially decoupled — new code uses REST, legacy code still hits Supabase directly.

### Risks
- **Backend Dependency**: The mobile app's *new* flows (`createTicket`, `listTickets`) rely on `saas_mobile_server` being deployed. Legacy flows still work via Supabase.
- **Data Integrity**: New columns (`work_paused`, `work_pause_reason`, `total_paused_minutes`) require backend migrations. The backend API expects these columns.
- **Inconsistency**: Having two data paths (REST vs. direct Supabase) in the same codebase creates maintenance overhead and subtle behavioral differences.

### Architecture Impact
- **Backend**: All ticket operations go through `/api/tickets/*` with auth middleware, property access checks, and cache invalidation.
- **Mobile**: A dual-stack exists:
  - `mobileApi.ts` wraps the new REST endpoints for ticket creation and listing.
  - `ticketService.ts` and `TicketDetailScreen` still use direct Supabase PostgREST and `serverApi.query` for reads, updates, and comments.

---

## 2. File-by-File Breakdown

| File | Purpose | Type of Change | Status |
|------|---------|----------------|--------|
| `saas_mobileApp_server/app/api/tickets/route.ts` | Backend: List & create tickets with AI classification. | **New** | ✅ Deployed |
| `saas_mobileApp_server/app/api/tickets/[id]/route.ts` | Backend: Get, update, delete single ticket. | **New** | ✅ Deployed |
| `saas_mobileApp_server/app/api/tickets/[id]/comments/route.ts` | Backend: Get & add comments. | **New** | ✅ Deployed |
| `saas_mobileApp_server/app/api/tickets/[id]/activity/route.ts` | Backend: Log activity events. | **New** | ✅ Deployed |
| `saas_mobileApp_server/app/api/tickets/[id]/materials/route.ts` | Backend: Create material requests linked to ticket. | **New** | ✅ Deployed |
| `saas_mobileApp_server/app/api/tickets/stats/route.ts` | Backend: Ticket statistics endpoint. | **New** | ✅ Deployed |
| `saas_mobile_app/utils/api/mobileApi.ts` | Mobile API wrappers for backend endpoints. | **Modified**: Added `createTicket`, `listTickets`, `createTicketMaterialRequest`, typed response shapes. | ✅ Active |
| `saas_mobile_app/types/ticketing.ts` | Extended type definitions for ticketing domain. | **Modified**: Added `RawTicket`, `TicketActivityLog`, `SlaPauseReason`, `MstDailyScore`, `SOPCompletion` interfaces (108 lines). | ✅ Active |
| `saas_mobile_app/services/ticketService.ts` | Legacy ticket service using direct Supabase. | **Unchanged**: Still uses `supabase.from('tickets')`. **NOT migrated** to `/api/tickets`. | ❌ Legacy |
| `saas_mobile_app/app/property/[propertyId]/tickets/[id].tsx` | Ticket Detail Screen. | **Modified**: Added Material Request modal, SLA Pause toggle, native Sharing/download. Uses `serverApi.query` for updates and direct Supabase for reads. | ⚠️ Partial |
| `saas_mobile_app/hooks/tenant/useTenantTickets.ts` | Hook for fetching tenant-specific tickets. | **Modified**: Uses `listTickets` from `mobileApi.ts` (REST). Still retains Supabase realtime subscription. | ⚠️ Partial |
| `saas_mobile_app/components/tickets/TicketCreateModal.tsx` | UI for creating tickets. | **Modified**: Uses `createTicket` from `mobileApi.ts` (REST) with AI classification response. | ✅ Migrated |
| `saas_mobile_app/components/mst/TicketPauseModal.tsx` | Modal to select SLA pause reason. | **New Feature**: Added. | ✅ Active |
| `saas_mobile_app/components/shared/TicketCard.tsx` <br/> `components/shared/TicketShuffleStack.tsx` | Reusable ticket UI components. | **Modified**: Updated styling and SLA indicator logic. | ✅ Active |

---

## 3. Feature Changes

### SLA Pause & Management
- **Before**: SLA timers were strictly calculated based on creation date.
- **After**: Staff can Pause/Resume SLAs directly from an Action Menu on the ticket detail screen. Reasons include "Waiting for Parts" and "Pending Approval".
- **Impact**: Provides accurate metrics for delays out of the team's control.
- **Implementation Status**: UI is implemented in `[id].tsx` and `TicketPauseModal.tsx`. Updates use `serverApi.query` (not the dedicated backend pause endpoint). The backend does **not** currently expose `PATCH /api/tickets/:id/pause-sla` — the audit originally spec'd this, but the actual backend route does not exist. Pausing is done via generic `PATCH /api/tickets/:id` or `serverApi.query`.

### Material Requests (Procurement) Integration
- **Before**: Material requests were entirely disconnected from ticket views.
- **After**: Material requests tied to a `ticket_id` are created from within the ticket detail view via `createTicketMaterialRequest` (`mobileApi.ts` → `POST /api/tickets/:id/materials`).
- **Impact**: Streamlines MST workflows by linking inventory procurement directly to work orders.
- **Implementation Status**: ✅ Fully functional end-to-end.

### Native Ticket Sharing & Media Download
- **Before**: Sharing ticket information required screenshots or copy-pasting.
- **After**: Integrated `expo-sharing` and `MediaLibrary` to download and share ticket photos/videos.
- **Impact**: Improved UX for cross-team communication and field documentation.
- **Implementation Status**: ✅ Active in `[id].tsx`.

### Ticket Rating System
- **Before**: No feedback loop upon ticket resolution.
- **After**: *Not yet implemented in the mobile app.* The backend schema supports `rating` and `rating_comment` columns, and the audit originally planned a `TicketRating.tsx` component, but it does not exist in the codebase.
- **Implementation Status**: ❌ Not implemented. Planned for future sprint.

### Ticket Editing Modal
- **Before**: Ticket details were read-only after creation.
- **After**: *Not yet implemented as a dedicated modal.* The audit originally planned `TicketEditModal.tsx`, but inline editing is not present in the codebase.
- **Implementation Status**: ❌ Not implemented. Status/reassignment is handled inline in `[id].tsx`.

---

## 4. Database Changes

### Identified Schema Changes
*Based on the new types and API requests.*

- **Table:** `tickets`
  - **New Columns:**
    - `work_paused` (boolean)
    - `work_pause_reason` (text)
    - `work_paused_at` (timestamp)
    - `total_paused_minutes` (integer)
    - `sla_deadline` (timestamp)
    - `sla_breached` (boolean)
    - `classification_source` (text)
    - `classification_confidence` (numeric)
    - `enhanced_classification` (jsonb)
    - `risk_flag` (text)
    - `llm_reasoning` (text)
    - `floor_number` (integer)
    - `location` (text)
  - **Note**: `rating` and `rating_comment` columns were planned but may not be migrated yet. Verify in Supabase.

- **Table:** `ticket_activity_log`
  - **Modified Enums:** Action types expanded to include `sla_paused`, `sla_resumed`, `procurement_requested`.
  - **Schema note**: The backend uses `performed_by` (not `user_id`) for the actor.

- **Table:** `material_requests` / `material_request_items`
  - Tightly coupled to `ticket_id` via the `POST /api/tickets/:id/materials` endpoint.

*Note: Migrations must be verified in `saas_mobileApp_server` deployment and the Supabase schema.*

---

## 5. API Changes

### Backend API (`saas_mobileApp_server`) — ✅ Complete

| Endpoint / Action | Behavior |
|-------------------|----------|
| **List Tickets** | `GET /api/tickets` — Advanced filtering (status, assignedTo, date range, search, SLA breached, raisedByRole). Returns joined data (category, assignee, creator, property, escalation logs). |
| **Create Ticket** | `POST /api/tickets` — AI classification (`classifyTicketEnhanced` + `resolveClassification`), auto-assigns category/skill_group, sets SLA deadline. Returns ticket + classification metadata. |
| **Bulk Update** | `PATCH /api/tickets` — Bulk assign tickets by ID array. |
| **Get Ticket** | `GET /api/tickets/:id` — Returns ticket with comments and user relations. Enforces property access. |
| **Update Ticket** | `PATCH /api/tickets/:id` — Generic update with property access check. Invalidates dashboard cache. |
| **Delete Ticket** | `DELETE /api/tickets/:id` — Soft/hard delete with property access check. Invalidates dashboard cache. |
| **List Comments** | `GET /api/tickets/:id/comments` — Ordered comments with user info. |
| **Add Comment** | `POST /api/tickets/:id/comments` — Inserts comment with auth user ID. |
| **Log Activity** | `POST /api/tickets/:id/activity` — Generic activity log insertion. |
| **Create Material Request** | `POST /api/tickets/:id/materials` — Creates `material_requests` + line items, logs to `ticket_comments` and `ticket_activity_log`. |
| **Ticket Stats** | `GET /api/tickets/stats` — Returns aggregate counts by status. |

### Mobile API Consumption — ⚠️ Partial

| Mobile Path | Uses REST API? | Uses Direct Supabase? |
|-------------|----------------|----------------------|
| `TicketCreateModal.tsx` → `createTicket` | ✅ `POST /api/tickets` | ❌ |
| `useTenantTickets.ts` → `listTickets` | ✅ `GET /api/tickets` | ❌ (for fetch, but realtime sub is Supabase) |
| `TicketDetailScreen` → `fetchTicket` | ❌ | ✅ Direct `supabase.from('tickets')` |
| `TicketDetailScreen` → `handleSendComment` | ❌ | ✅ Direct `supabase.from('ticket_comments')` |
| `TicketDetailScreen` → `handleUpdateStatus` | ❌ | ✅ `serverApi.query({ table: 'tickets', action: 'update' })` |
| `TicketDetailScreen` → `handleTogglePause` | ❌ | ✅ `serverApi.query({ table: 'tickets', action: 'update' })` |
| `TicketDetailScreen` → `handleReassign` | ❌ | ✅ `serverApi.query({ table: 'tickets', action: 'update' })` |
| `TicketDetailScreen` → `handleAddMaterial` | ✅ `POST /api/tickets/:id/materials` | ❌ |
| `ticketService.ts` → ALL methods | ❌ | ✅ Direct Supabase |

**Breaking Changes**: The mobile app's *new* flows (`createTicket`, `listTickets`, `createTicketMaterialRequest`) are reliant on the custom backend REST API. Legacy flows still bypass the backend and hit Supabase directly.

---

## 6. Query & Cache Changes

### Architecture Shift
- **Target State**: All ticket operations should route through `mobileApi.ts` → backend REST API, with React Query for caching.
- **Current State**:
  - `useTenantTickets.ts` uses a basic `useState`/`useEffect` pattern (not React Query) but fetches via REST.
  - `TicketDetailScreen` uses `useDashboardFetch` (a custom hook with `AsyncStorage` caching) for the main fetch, but comments/activities/escalations are fetched imperatively inside `fetchTicket`.
  - `ticketService.ts` is entirely imperative direct Supabase — no React Query, no REST.
  - **Realtime**: Direct `supabase.channel` subscriptions are still active in `useTenantTickets.ts` and `ticketService.ts`. There is **no** HTTP polling replacement.

### Expected Benefit (When Fully Migrated)
- React Query inherently provides better offline resilience, optimistic UI updates, and stale-while-revalidate UX patterns.
- Prevents the mobile app from establishing too many WebSocket connections on large properties.

### Current Risks
- Multiple data fetching patterns coexist (REST, direct Supabase, `serverApi.query`, `useDashboardFetch`), creating cognitive load and potential cache inconsistency.
- `serverApi.query` is a generic mutation layer that the backend API was designed to replace. Keeping it in use undermines the security benefits of the REST migration.

---

## 7. UI Changes

- **Color Palette Refresh**: Primary buttons, badges, and accents shifted toward the brand's Slate Blue-Green (`#708F96`) in newer components. Legacy components may still use standard Blue (`#3B82F6`).
- **Ticket Detail Screen (`[id].tsx`)**:
  - Added Top Navigation action buttons for Share, Catalog (Material Request), and Pause SLA.
  - Added Material Request modal with item lines and procurement assignee selection.
  - SLA Pause modal with reason selection.
  - Media capture, upload, and download for before/after photos and videos.
  - Tabs for Details, Timeline (activity log), and Chat (comments).
- **Components**:
  - `TicketPauseModal.tsx`: New component for pausing SLA with reason selection.
  - `TicketCreateModal.tsx`: Polished UI with AI classification feedback, voice-to-text, and photo upload.

---

## 8. Performance Impact

- **Network Calls (New Flows)**: Backend API aggregates joins server-side (e.g., `/api/tickets/:id` fetches comments and metadata in one pass). However, `TicketDetailScreen` currently makes **5+ separate Supabase queries** (ticket, comments, activity, escalation logs, property features) because it does not use the backend endpoint.
- **Queries Reduced (Backend)**: The backend endpoints reduce raw client queries for list/create operations.
- **Rendering**: `useDashboardFetch` provides some `AsyncStorage` caching, but the detail screen still triggers a full reload on every mount.
- **Startup Impact**: No significant change. The legacy `ticketService.ts` is imported by some screens but does not block startup.

---

## 9. Risk Analysis

| Risk | Severity | Description |
|------|----------|-------------|
| **Backend Dependency (New Flows)** | Medium | `createTicket` and `listTickets` will fail if `saas_mobile_server` is down. Legacy flows still work via Supabase, so the app is not fatally crippled. |
| **Dual Stack Complexity** | High | Maintaining both `mobileApi.ts` (REST) and `ticketService.ts` (Supabase) + `serverApi.query` creates inconsistency. A developer may fix a bug in one path but miss the other. |
| **Database Schema** | High | Unavailability of `work_paused`, `total_paused_minutes`, or classification columns will cause 500 errors on API calls and UI crashes. |
| **Realtime UX** | Low | Chat messages inside tickets still appear instantly via Supabase realtime in `useTenantTickets.ts`. No degradation has occurred. |
| **Security Regression** | Medium | `serverApi.query` and direct Supabase in `TicketDetailScreen` bypass the backend's property access checks. RLS is the only guard. The backend API enforces `getPropertyAccess`. |

---

## 10. Implementation Status & Gap Analysis

### ✅ Completed
1. Backend REST API routes (`/api/tickets/*`) with auth, filtering, AI classification, and cache invalidation.
2. `mobileApi.ts` wrappers for `createTicket`, `listTickets`, `createTicketMaterialRequest`.
3. `TicketCreateModal.tsx` migrated to use REST API.
4. `useTenantTickets.ts` migrated to use REST API for fetching.
5. Material Request integration end-to-end (mobile UI → backend → DB).
6. SLA Pause UI and activity logging.
7. Type extensions in `types/ticketing.ts`.

### ❌ Not Completed / Still Legacy
1. **`ticketService.ts`**: Still uses direct Supabase. Needs full rewrite to call `mobileApi.ts` or be deprecated.
2. **`TicketDetailScreen` (`[id].tsx`)**: Fetches ticket, comments, activity, and escalation logs via direct Supabase. Updates status, assignment, and pause via `serverApi.query`. Should use `GET /api/tickets/:id`, `PATCH /api/tickets/:id`, and `POST /api/tickets/:id/comments`.
3. **`TicketRating.tsx` component**: Does not exist. Planned but not built.
4. **`TicketEditModal.tsx` component**: Does not exist. Planned but not built.
5. **Dedicated SLA Pause Endpoint**: The audit originally spec'd `PATCH /api/tickets/:id/pause-sla`, but the backend implements pausing via the generic `PATCH /api/tickets/:id` update. A dedicated endpoint with business logic (e.g., calculating `total_paused_minutes`) could be added.
6. **React Query Standardization**: Only `useDashboardFetch` is used in the detail screen. No `@tanstack/react-query` migration for ticket data.
7. **Realtime Deprecation**: Supabase realtime is still active. No polling mechanism has replaced it.

---

## 11. Recommended Follow-Ups

1. **Migrate `ticketService.ts`**: Either refactor it to use `mobileApi.ts` endpoints or delete it and migrate all callers to `mobileApi.ts`. This is the highest-priority cleanup.
2. **Migrate `TicketDetailScreen`**: Switch `fetchTicket` to `GET /api/tickets/:id`, comments to `GET /api/tickets/:id/comments`, and mutations to `PATCH /api/tickets/:id`. This eliminates `serverApi.query` from the ticket flow entirely.
3. **Implement Ticket Rating**: Build `TicketRating.tsx` and add `rating`/`rating_comment` handling to the backend update endpoint if not already present.
4. **Implement Ticket Edit Modal**: Build `TicketEditModal.tsx` for editing title, description, and category post-creation.
5. **Add Dedicated SLA Pause Endpoint**: Consider `PATCH /api/tickets/:id/pause-sla` on the backend to encapsulate pause duration calculations and prevent invalid state transitions.
6. **React Query Migration**: Standardize ticket data fetching on `@tanstack/react-query` with proper cache keys and invalidation.
7. **Remove or Deprecate `serverApi.query`**: Once all ticket screens use REST, remove the generic query mutation path to enforce backend-controlled business logic.
8. **Database Migration Check**: Ensure all new columns (`work_paused`, `classification_confidence`, `floor_number`, etc.) are present in the production Supabase schema.
9. **Dark Mode Audit**: The detail screen dynamically adapts to dark mode via `useTheme`. Ensure new modals (`TicketPauseModal`, Material Request modal) also respect the theme.

---

*Audit compiled from codebase analysis of `saas_mobileApp_server/app/api/tickets/*` and `saas_mobile_app/services/ticketService.ts`, `utils/api/mobileApi.ts`, `app/property/[propertyId]/tickets/[id].tsx`.*
