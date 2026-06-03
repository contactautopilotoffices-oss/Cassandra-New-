# Global Application Change Audit

This document provides a comprehensive analysis of the architectural, logic, and feature changes introduced across the entire `saas_mobile` application since the last commit on `origin/main`. 

*Note: As requested, UI styling, color adjustments, and dark/light mode toggles have been excluded from this audit.*

---

## 1. Executive Summary

The application has undergone a fundamental architectural shift. The app has transitioned from a **Thick Client Architecture** (where the mobile app directly executed SQL-like queries against Supabase via PostgREST) to a **Thin Client Architecture** (where the mobile app communicates with a dedicated backend server: `saas_mobile_server`).

This shift necessitated the deletion of generic API clients and custom query hooks, replacing them with strongly-typed, domain-specific service layers and React Query implementations. In parallel, the app introduced sophisticated Dashboard caching mechanisms (critical vs. deferred loading) and major feature expansions in SOP execution, Gamification, Procurement, and Voice AI.

---

## 2. API & Backend Migration (The Biggest Change)

### Deprecated and Deleted Code
The legacy approach of using a custom client wrapper for database queries has been entirely removed.
- **Deleted Files**: 
  - `saas_mobile/services/api/client.ts`
  - `saas_mobile/hooks/useServerQuery.ts`
  - `saas_mobile/hooks/useServerMutation.ts`

### New Data Flow Architecture
Previously, the app used `serverApi.query({ table: '...', action: 'select' })`. Now, the application routes all traffic through standard HTTP REST endpoints (e.g., `serverApi.get('/api/users')`).

- **Services Completely Refactored**:
  - `saas_mobile/services/ticketService.ts`
  - `saas_mobile/services/propertyService.ts`
  - `saas_mobile/services/userService.ts`
  - `saas_mobile/services/electricityService.ts`
  - `saas_mobile/services/dieselService.ts`
  - `saas_mobile/services/ppmService.ts`
  - `saas_mobile/services/sopService.ts`
  - `saas_mobile/services/meetingRoomService.ts`
  - `saas_mobile/services/authService.ts`
  - `saas_mobile/services/reportService.ts`
  - `saas_mobile/services/onboardingService.ts`
- **Core Server Config Updates**:
  - `saas_mobile/lib/serverApi.ts`
  - `saas_mobile/utils/api/mobileApi.ts`

**Impact**: Better security (database schema is hidden from the client), reduced client payload sizes, and centralized business logic on the backend. 

### Realtime Subscriptions
Direct `supabase.channel` WebSocket connections have been deprecated in services like `ticketService.ts`. The app now relies on HTTP Polling (e.g., `setInterval` combined with React Query cache invalidation) to reduce WebSocket overhead on large enterprise deployments.

---

## 3. Dashboard Performance & Logic Overhaul

### Critical vs. Deferred Fetching Pattern
Dashboards have been heavily refactored to eliminate initial load times and prevent UI blocking. Upon component mount, the dashboard instantly paints using `AsyncStorage` data, then fetches critical data, and defers secondary metrics.

- **Files Modified**:
  - `saas_mobile/components/dashboard/LovableStaffDashboard.tsx`
  - `saas_mobile/components/dashboard/SecurityDashboard.tsx`
  - `saas_mobile/components/dashboard/LovableMstDashboard.tsx`
  - `saas_mobile/components/dashboard/LovablePropertyAdminDashboard.tsx`
  - `saas_mobile/components/dashboard/LovableSuperAdminDashboard.tsx`
  - `saas_mobile/components/dashboard/MasterAdminDashboard.tsx`
  - `saas_mobile/components/tenant/TenantDashboard.tsx`
  - `saas_mobile/stores/dashboardStore.ts`

### Dynamic Filtering
- Added native state toggles inside dashboards (e.g., `LovableStaffDashboard.tsx`) for **Time Filters** (`today`, `month`, `all_time`) and **Ticket Scopes** (`mine`, `all`).
- These filters dynamically slice the locally cached ticket arrays rather than triggering new network requests, vastly improving perceived performance.

---

## 4. Feature Expansions (Logic & Business Workflows)

### 4.1 Gamification Engine
Leaderboards now dynamically render real data instead of defaulting to demo arrays. Empty states are gracefully handled if a property has no gamification data.
- **Files Modified**:
  - `saas_mobile/components/gamification/Leaderboard.tsx`
  - `saas_mobile/components/gamification/AchievementBadge.tsx`
  - `saas_mobile/components/gamification/LevelBadge.tsx`
  - `saas_mobile/components/gamification/XPBar.tsx`

### 4.2 Standard Operating Procedures (SOPs)
Technicians can now scan QR codes on assets to automatically trigger specific checklist workflows. Execution logs are tied to `ticket_activity_log`.
- **Files Modified**:
  - `saas_mobile/components/sop/SOPChecklistRunner.tsx`
  - `saas_mobile/components/sop/SOPQRScannerModal.tsx`
  - `saas_mobile/components/sop/SOPDashboard.tsx`
  - `saas_mobile/components/sop/SOPCompletionHistory.tsx`
  - `saas_mobile/components/sop/SOPTemplateManager.tsx`
  - `saas_mobile/components/sop/SOPDueAlerts.tsx`

### 4.3 Procurement & Inventory
Users can browse a procurement catalog and submit Material Requests. These requests are now tightly coupled with individual Tickets.
- **Files Modified**:
  - `saas_mobile/components/procurement/MobileRequestList.tsx`
  - `saas_mobile/components/procurement/PendingApprovals.tsx`
  - `saas_mobile/components/stock/StockScannerModal.tsx`

### 4.4 Cassandra Voice AI
Voice AI processing logic was refined to improve intent recognition for facility-specific queries (e.g., booking rooms, checking diesel levels).
- **Files Modified**:
  - `saas_mobile/services/ai/pipeline/retrieval.ts`
  - `saas_mobile/services/ai/pipeline/tools.ts`
  - `saas_mobile/components/cassandra/CassandraSessionModal.tsx`
  - `saas_mobile/components/cassandra/TranscriptViewer.tsx`
  - `saas_mobile/components/voice/VoiceSessionSheet.tsx`

### 4.5 Tenant Experience
Optimized layouts and routing for tenants booking rooms and reviewing their profiles.
- **Files Modified**:
  - `saas_mobile/components/tenant/SuperTenantSidebar.tsx`
  - `saas_mobile/components/tenant/tabs/OverviewTab.tsx`
  - `saas_mobile/components/tenant/tabs/ProfileTab.tsx`
  - `saas_mobile/components/tenant/tabs/RequestsTab.tsx`
  - `saas_mobile/components/tenant/tabs/RoomBookingTab.tsx`

---

## 5. Security & Push Notifications

### Shift Management & Authentication
Dashboards now explicitly check if a user is "on-shift" via the `resolver_stats` table before assigning push notifications. Context boundaries have been updated.
- **Files Modified**:
  - `saas_mobile/context/AuthContext.tsx`

### App Permissions
Push notification device token registration is now deferred until the user explicitly completes the `PermissionOnboarding` flow, ensuring compliance with iOS/Android guidelines.
- **Files Modified**:
  - `saas_mobile/hooks/usePushNotifications.ts`

---

## 6. Types & Type Safety

Extensive updates were made to the core typescript files to support the new backend API responses.
- **Files Modified**:
  - `saas_mobile/types/ticketing.ts` (Major expansion of types)
  - `saas_mobile/types/rbac.ts`
  - `saas_mobile/types/index.ts`

---

## 8. MST and Staff Account Specifics

Several major quality-of-life and productivity enhancements were specifically tailored for the **Multi-Skilled Technician (MST)** and **Staff** personas.

### Dashboard Refinements (`LovableMstDashboard.tsx`, `LovableStaffDashboard.tsx`)
- **Instant Load**: Staff and MSTs now see their dashboard instantly on app launch due to the new `AsyncStorage` caching layer, eliminating the previous "loading spinner" wall.
- **Dynamic Scopes & Toggles**: MSTs can seamlessly toggle between "My Tickets" and "Property Level" views, and filter by "Today" vs. "This Month" directly on the dashboard without navigating to the main ticket list.
- **Memoized Countdown Timers**: The "Time left today" SLA countdown was extracted into a self-contained `CountdownTimer` component to prevent the entire dashboard from re-rendering every second, improving scroll performance.
- **Unified Backgrounds**: Removed purely weather-based backgrounds in favor of the standardized `DashboardBackground`, ensuring consistent text legibility under all lighting conditions.

### Workflow & Empowerment
- **Material Requests**: MSTs can now request parts/materials directly from within a ticket view using the new Procurement catalog modal, linking inventory to their specific work orders.
- **SLA Pausing**: Technicians are now empowered to manually pause an SLA timer (e.g., "Waiting for Parts", "Pending Approval") directly from the ticket action menu, ensuring metrics accurately reflect their efficiency.
- **Gamification Visibility**: Staff can now see their live XP, current level, and where they rank against peers via the dynamically updating `Leaderboard` and `AchievementBadge` components.

---

## 9. Risk & Regression Analysis

| Risk Area | Severity | Explanation |
|-----------|----------|-------------|
| **Backend Parity** | **Critical** | The app's deletion of `api/client.ts` means it 100% relies on `saas_mobile_server` being deployed. If the backend is down, the entire app will fail to load properties, users, or tickets. |
| **Data Staling** | **Medium** | Migrating away from Supabase WebSockets means chat messages, ticket updates, and leaderboard rankings are subject to polling intervals (15-30s delay). |
| **Cache Synchronization** | **Low** | The aggressive implementation of `useAsyncStorageCache` on dashboards might result in users seeing a "flash" of old data (from yesterday) for 1-2 seconds before the background fetch updates the UI. |

---

## Conclusion
The current branch represents a maturation of the codebase from a "prototypical" direct-to-database app to an enterprise-grade REST architecture. The primary developer focus moving forward must be ensuring the `saas_mobile_server` endpoints perfectly mirror the expected interfaces defined in `services/*.ts`.
