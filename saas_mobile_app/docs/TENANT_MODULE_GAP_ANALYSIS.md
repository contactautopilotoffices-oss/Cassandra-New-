# Tenant Module: Web vs Mobile Gap Analysis

> **Note:** The web app source (`saas_development/`) is **not present** in this working tree — only a `.next` build output exists. This analysis is based on:
> - The **complete mobile tenant codebase** (`saas_mobile/`)
> - **Mobile API interfaces** in `utils/api/mobileApi.ts` that mirror web endpoints
> - **Supabase RPC migrations** present in the mobile repo
> - Inferred web capabilities from mobile's expected API contracts

---

## 1. MOBILE TENANT MODULE — Full Inventory

### 1.1 Screens & Routes

| Route | File | Status | Description |
|-------|------|--------|-------------|
| `/property/[propertyId]/tenant/` | `app/property/[propertyId]/tenant/index.tsx` | ✅ | Role-guarded entry. Checks `tenant` / `super_tenant` roles. Redirects non-tenants. |
| `/property/[propertyId]/tenant/` (layout) | `app/property/[propertyId]/tenant/_layout.tsx` | ✅ | Minimal `<Slot />` wrapper. |
| **Sub-routes** | — | ❌ **None** | Entire tenant experience is a single-page dashboard with internal tab switching. No deep-linkable tabs. |

### 1.2 Components

| Component | Location | Lines | Status | Description |
|-----------|----------|-------|--------|-------------|
| `TenantDashboard` | `components/tenant/TenantDashboard.tsx` | 246 | ✅ | Main orchestrator. Manages 4 tabs, property picker, ticket modal, weather bg. |
| `TenantGlassHeader` | `components/tenant/TenantGlassHeader.tsx` | 356 | ✅ | Weather-aware glassmorphism header with animated dot, pixel font property name, temp widget. |
| `TenantStatsCard` | `components/tenant/TenantStatsCard.tsx` | 259 | ✅ | Animated stat card with glassmorphism, count-up, trend arrows. |
| `TenantTicketCard` | `components/tenant/TenantTicketCard.tsx` | 329 | ✅ | Rich ticket card with priority/status tags, SLA countdown, assignee badge, CTAs. |
| `SuperTenantSidebar` | `components/tenant/SuperTenantSidebar.tsx` | 334 | ✅ Built, ❌ **Unused** | Full glassmorphism drawer. Never rendered in `TenantDashboard`. |
| `TenantBottomNav` | `components/tenant/TenantBottomNav.tsx` | 180 | ✅ Built, ❌ **Unused** | Animated bottom nav with sliding pill, SVG icons, haptics. Replaced by `MobileFooter`. |
| `OverviewTab` | `components/tenant/tabs/OverviewTab.tsx` | 458 | ⚠️ Partial | Home tab. Search bar (decorative), stats, recent tickets (max 3), Quick Access shortcuts (all no-ops). |
| `RequestsTab` | `components/tenant/tabs/RequestsTab.tsx` | 240 | ✅ | Tickets tab. Filter chips, FlatList of `TenantTicketCard`, "New Request" CTA, pull-to-refresh. |
| `RoomBookingTab` | `components/tenant/tabs/RoomBookingTab.tsx` | 342 | ⚠️ Partial | Lists meeting rooms. **"Book" button is a no-op stub.** No booking flow. |
| `ProfileTab` | `components/tenant/tabs/ProfileTab.tsx` | 351 | ⚠️ Partial | Avatar, account info, settings (all display-only / hardcoded), sign out. |

**Placeholder Components** (all `<Text>Placeholder</Text>`):
- `components/dashboard/SuperTenantDashboard.tsx`
- `components/dashboard/TenantDashboard.tsx`
- `components/tickets/TenantTicketingDashboard.tsx`
- `components/meeting-rooms/TenantRoomBooking.tsx`

### 1.3 Hooks

| Hook | Location | Lines | Status | Description |
|------|----------|-------|--------|-------------|
| `useTenantTickets` | `hooks/tenant/useTenantTickets.ts` | 103 | ✅ | Fetches tickets from Supabase with real-time subscription. Returns tickets, stats, loading, refetch. |
| `useTenantStats` | `hooks/tenant/useTenantStats.ts` | 23 | ✅ | Computes open/total/critical/completion stats from ticket array. |
| `useSuperTenantProperties` | `hooks/tenant/useSuperTenantProperties.ts` | 59 | ✅ | Calls web API `GET /api/super-tenant` to fetch super-tenant properties. |

### 1.4 Services (Shared, Not Tenant-Specific)

| Service | Status | Description |
|---------|--------|-------------|
| `meetingRoomService.ts` | ✅ Exists, ❌ **Orphaned** | Full CRUD: `getRooms()`, `getBookings()`, `createBooking()`, `cancelBooking()`, `checkAvailability()`. **Not wired into tenant UI.** |
| `mobileApi.ts` | ✅ | Web API client. Defines `createTicket()`, `listTickets()`, `getSuperTenantProperties()`, `checkPropertyAccess()`, reports APIs, procurement APIs. |

### 1.5 Types & RBAC

| File | Tenant-Relevant Content |
|------|------------------------|
| `types/index.ts` | `UserRole` includes `'tenant'`, `'super_tenant'`. `CAPABILITY_MATRIX`: tenant → `tickets:read, tickets:create`; super_tenant → same + `properties:view, dashboards:view, reports:view`. `MeetingRoom`, `RoomBooking` types defined. |
| `types/rbac.ts` | `RoleKey` includes `'tenant_user'`, `'tenant'`, `'super_tenant'`. Level `4` (lowest). |
| `types/cassandra-room.ts` | Cassandra voice AI room types (separate from tenant module). |

---

## 2. WEB APP — Inferred Capabilities (from Mobile API Contracts)

Since the web source is absent, the following is reconstructed from `mobileApi.ts` and mobile hooks that call web endpoints:

### 2.1 Web API Endpoints Used by Mobile

| Endpoint | Method | Mobile Usage | Web Capability |
|----------|--------|--------------|----------------|
| `/api/tickets` | POST | `createTicket()` — tenant ticket creation | ✅ Ticket creation with AI classification |
| `/api/tickets` | GET | `listTickets()` — filtered by property, status, raisedBy | ✅ Ticket listing with filters |
| `/api/tickets/[id]/photos` | POST | `uploadTicketPhoto()` — before/after photos | ✅ Photo upload |
| `/api/super-tenant` | GET | `getSuperTenantProperties()` — multi-property fetch | ✅ Super tenant property assignment API |
| `/api/auth/property-access` | GET (inferred) | `checkPropertyAccess()` mirrors this logic | ✅ Property access verification |
| `/api/mst/gamification/leaderboard` | GET | `getLeaderboard()` — MST gamification | ⚠️ MST-only, not tenant-facing |
| `/api/mst/gamification/my-stats` | GET | `getMyGamificationStats()` — MST stats | ⚠️ MST-only, not tenant-facing |
| `/api/reports/requests-report` | GET | `getRequestsReport()` — report generation | ✅ Reports API |
| `/api/reports/snag-report/[importId]` | GET | `getSnagReport()` — snag detail report | ✅ Snag reports |
| `/api/procurement/requests` | GET/PATCH | `listPendingApprovals()`, `updateMaterialRequestStatus()` | ✅ Procurement / material requests |

### 2.2 Web Backend Tables (Inferred from Mobile Supabase Queries)

| Table | Used By Mobile For | Status |
|-------|-------------------|--------|
| `tickets` | Ticket listing, creation, stats | ✅ |
| `meeting_rooms` | Room listing in `RoomBookingTab` | ✅ |
| `meeting_room_bookings` | `meetingRoomService` CRUD (unused in UI) | ✅ Schema exists |
| `properties` | Property access check, name lookup | ✅ |
| `property_memberships` | Role verification (`tenant`, `super_tenant`) | ✅ |
| `organization_memberships` | Org-level role check | ✅ |
| `users` | Master admin bypass, profile info | ✅ |

---

## 3. GAP ANALYSIS: What Mobile Has vs What It Needs

### 3.1 🔴 Critical Gaps (Blocking / Broken)

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| 1 | **Room "Book" button is a no-op** | `RoomBookingTab.tsx:131` | Room booking is advertised but impossible. `meetingRoomService.createBooking()` exists but is never called. |
| 2 | **No "My Bookings" view** | — | Tenant cannot see their own room bookings after (hypothetically) creating one. |
| 3 | **No room detail / booking form screen** | — | No date/time picker, no purpose input, no attendee count, no confirmation flow. |
| 4 | **Quick Access shortcuts are non-functional** | `OverviewTab.tsx` | Helpdesk, Visitor, Amenities, Parking buttons do nothing. |
| 5 | **Search bar is decorative** | `OverviewTab.tsx` | No ticket/room search implementation. |
| 6 | **Profile settings are hardcoded display-only** | `ProfileTab.tsx` | Push Notifications, Camera Access, Biometric Login are static strings. No toggle logic, no persistence. |
| 7 | **"View All" tickets button does nothing** | `OverviewTab.tsx` | Should navigate to full ticket list; is a no-op. |

### 3.2 🟡 Medium Gaps (Missing Features)

| # | Gap | Web Equivalent (Inferred) | Mobile Status |
|---|-----|--------------------------|---------------|
| 8 | **No tenant billing / rent payments** | Web likely has tenant billing module | ❌ Completely absent |
| 9 | **No visitor pre-registration** | Web VMS likely allows visitor invites | ❌ Quick Access "Visitor" is a no-op |
| 10 | **No amenity booking (beyond meeting rooms)** | Web may have gym, parking, etc. booking | ❌ "Amenities" Quick Access is a no-op |
| 11 | **No parking management** | Web may have parking slot booking | ❌ "Parking" Quick Access is a no-op |
| 12 | **No announcements / notices board** | Web dashboard likely has org announcements | ❌ Missing |
| 13 | **No document / lease access** | Web may have tenant document portal | ❌ Missing |
| 14 | **No emergency / SOS feature** | Common in FM tenant apps | ❌ Missing |
| 15 | **No feedback / rating system** | Post-resolution ticket rating | ❌ Missing |
| 16 | **No service catalog** | Tenant can't browse service categories before raising ticket | ❌ Missing |
| 17 | **Super tenant sidebar unused** | `SuperTenantSidebar.tsx` is fully built but never rendered | ⚠️ Waste of implemented code |
| 18 | **TenantBottomNav unused** | `TenantBottomNav.tsx` is fully built but replaced by `MobileFooter` | ⚠️ Waste of implemented code |

### 3.3 🟢 Minor Gaps / Polish

| # | Gap | Details |
|---|-----|---------|
| 19 | **ProfileTab hardcodes "Tenant" badge** | Doesn't reflect `super_tenant` status dynamically. |
| 20 | **No dedicated tenant service layer** | All data fetching is inline in hooks/components. Mixed patterns: Supabase direct, web API, shared modals. |
| 21 | **No tenant-specific routes** | Everything lives in a single `index.tsx`. No deep-linking to specific tabs. |
| 22 | **'use client' directive in TenantBottomNav** | Meaningless in React Native. Web React habit carried over. |
| 23 | **4 placeholder components** | `SuperTenantDashboard`, `TenantDashboard` (in `components/dashboard/`), `TenantTicketingDashboard`, `TenantRoomBooking` — all dead code. |

---

## 4. FEATURE MATRIX: Web (Inferred) vs Mobile

| Feature | Web (Inferred) | Mobile | Gap |
|---------|---------------|--------|-----|
| **Authentication & Access** | | | |
| Tenant role login | ✅ | ✅ | — |
| Super tenant multi-property | ✅ | ✅ | — |
| Property access check | ✅ | ✅ | — |
| **Tickets** | | | |
| Raise ticket | ✅ | ✅ | — |
| AI ticket classification | ✅ | ✅ (via `TicketCreateModal`) | — |
| Photo upload | ✅ | ✅ | — |
| View ticket list | ✅ | ✅ | — |
| Filter tickets (status) | ✅ | ✅ | — |
| Ticket detail view | ✅ | ✅ (shared `/tickets/[id]`) | — |
| Real-time ticket updates | ✅ | ✅ (Supabase subscription) | — |
| Ticket search | ✅ | ❌ | 🔴 |
| **Meeting Rooms** | | | |
| Browse rooms | ✅ | ✅ | — |
| Filter by capacity | ✅ | ✅ | — |
| Room detail view | ✅ | ❌ | 🟡 |
| Book room (date/time/purpose) | ✅ | ❌ (button is no-op) | 🔴 |
| View my bookings | ✅ | ❌ | 🔴 |
| Cancel booking | ✅ | ❌ (service exists, UI doesn't) | 🟡 |
| Check availability | ✅ | ❌ (service exists, UI doesn't) | 🟡 |
| **Other Amenities** | | | |
| Visitor pre-registration | ✅ (inferred) | ❌ | 🟡 |
| Parking booking | ✅ (inferred) | ❌ | 🟡 |
| General amenities booking | ✅ (inferred) | ❌ | 🟡 |
| **Profile & Settings** | | | |
| View profile | ✅ | ✅ | — |
| Edit profile | ✅ | ❌ (display-only) | 🟡 |
| Push notification settings | ✅ | ❌ (hardcoded) | 🔴 |
| Camera/biometric settings | ✅ | ❌ (hardcoded) | 🔴 |
| **Communications** | | | |
| Org announcements | ✅ (inferred) | ❌ | 🟡 |
| Cassandra AI assistant | ✅ | ✅ (via `MobileFooter` orb) | — |
| **Billing & Documents** | | | |
| Rent/dues payment | ✅ (inferred) | ❌ | 🟡 |
| Lease document access | ✅ (inferred) | ❌ | 🟡 |
| **Reports** | | | |
| View reports | ✅ | ❌ (super tenant only, not wired) | 🟡 |

---

## 5. RECOMMENDED PRIORITY ORDER

### Phase 1: Fix Broken Features (This Week)
1. **Wire up the "Book" button** in `RoomBookingTab` — call `meetingRoomService.createBooking()`
2. **Add a booking form modal** — date picker, time slot selector, purpose, attendees
3. **Add "My Bookings" tab/section** — show tenant's own bookings with cancel option
4. **Wire Quick Access shortcuts** — at minimum navigate to relevant screens (Visitors → `/visitors`, etc.)
5. **Make "View All" tickets navigate** to full `RequestsTab` or `/tickets` route

### Phase 2: Complete Core Tenant Experience (Next Sprint)
6. **Implement search** in `OverviewTab` — search tickets by title/number
7. **Make profile settings functional** — toggles with AsyncStorage persistence
8. **Add room detail screen** — show amenities, availability calendar, booking CTA
9. **Render `SuperTenantSidebar`** — actually use the built component for super tenants
10. **Add tenant-specific routes** — `/tenant/tickets`, `/tenant/rooms`, `/tenant/profile` for deep-linking

### Phase 3: Expand Tenant Feature Set (Future)
11. Visitor pre-registration flow
12. Amenity booking (gym, parking, etc.)
13. Announcements / notices board
14. Document / lease access
15. Post-resolution ticket rating
16. Service catalog before ticket creation

---

## 6. CODE DEBT TO CLEAN UP

| Item | Action |
|------|--------|
| `TenantBottomNav.tsx` | Either use it (restore tenant-specific nav) or delete it |
| `SuperTenantSidebar.tsx` | Either render it in `TenantDashboard` or delete it |
| 4 placeholder components | Delete `SuperTenantDashboard`, `TenantDashboard`, `TenantTicketingDashboard`, `TenantRoomBooking` |
| `'use client'` in `TenantBottomNav.tsx` | Remove (React Native doesn't use this) |

---

*Generated: 2026-05-19*
*Mobile repo: `saas_mobile/`*
*Web repo: `saas_development/` — source not present in working tree*
