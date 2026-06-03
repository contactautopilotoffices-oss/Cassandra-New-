# CURRENT APP ARCHITECTURE

## 1. Executive Summary

The Autopilot Mobile App (`saas_mobile`) has been architecturally optimized for instantaneous startup, offline reliability, and rendering performance. The core philosophy is **"Render immediately from cache, validate in the background."**

To achieve this, the application leverages a multi-tiered caching strategy (MMKV + AsyncStorage), an offline-first React Query configuration, atomic Zustand stores, and a prioritized background prefetch orchestrator.

This document serves as the canonical reference for the current architecture and provides standards for all future feature development.

---

## 2. Startup Architecture

The startup sequence is designed to never block the main thread waiting for network requests.

### **The Startup Lifecycle**

1. **App Launch (`app/_layout.tsx`)**: JS evaluation begins (`JS_EVAL`). Sentry is initialized.
2. **Native Splash Screen**: `SplashScreen.preventAutoHideAsync()` keeps the splash screen visible.
3. **Provider Initialization**: The provider tree mounts (`PersistQueryClientProvider` -> `SafeAreaProvider` -> `ThemeProvider` -> `AuthProvider`).
4. **Font Loading**: Custom fonts load asynchronously with a strict **3-second timeout**. If the network is slow, it falls back to system fonts rather than stalling the app.
5. **Session Restore (`AuthContext.tsx`)**:
   - **Fast Path**: Directly reads the local session from Supabase's `AsyncStorage` token.
   - Restores session immediately, bypassing network validation.
6. **Membership Restore**:
   - Reads `UserMembership` (Properties, Org ID, Roles) from `AsyncStorage` (24-hour TTL).
   - Sets the global state synchronously.
7. **Splash Hiding**: Native splash is hidden (`SplashScreen.hideAsync()`). Custom `AutopilotSplash` may run if fonts were not already cached.
8. **Dashboard Render**: The dashboard paints immediately using persisted data from `Zustand` and `MMKV`.
9. **Background Refresh**: `fetchMembership` runs silently to update the cache; `useSmartPrefetch` begins hydrating the React Query cache.

### **Critical Path vs Background Path**
- **Critical**: Local Session Read → Local Membership Read → Render Cached UI.
- **Background**: Supabase Network Auth → Membership Network Fetch → Data Prefetching.

---

## 3. Authentication Architecture

Authentication is managed via `AuthContext.tsx` and Supabase `gotrue`.

### **Session Lifecycle**
- **Restoration**: Uses `fastRestoreSession` to read the stored JWT token immediately on boot.
- **Validation**: Relies on Supabase's `onAuthStateChange` to listen for `SIGNED_IN`, `TOKEN_REFRESHED`, or `SIGNED_OUT` events from the background network worker.
- **Metadata**: User metadata (avatar, full name) is enriched and attached to the `AuthUser` object.
- **Background Operations**: Upon successful login/restore, the app silently fetches property memberships and pre-warms the Cassandra (Voice AI) JWT tokens.

---

## 4. Property Architecture

Property memberships determine what a user can see and do. This is a heavy relational query that has been heavily optimized.

### **Property Resolution**
- Users belong to an `organization` and specific `properties`.
- **Org Admins / Owners**: The system detects an Org Admin role and automatically fetches all properties within that organization, granting implicit access.

### **Property Membership Cache**
- Storage: `AsyncStorage`
- Key: `@autopilot_membership:{userId}`
- TTL: 24 Hours
- **Behavior**: At startup, `loadCachedMembership` returns properties instantly. The app then calls `fetchMembership` to pull fresh data from Supabase, silently patching the cache and state if access was revoked or granted.

### **Property Switching**
- Changing a property immediately re-renders the dashboard using the newly selected `propertyId` as the React Query cache key. No blocking loading screens are shown if the target property's data is already prefetched.

---

## 5. Cache Architecture

The application uses specific storage engines for specific types of data to balance speed and payload size.

| Layer | Engine | TTL | Purpose | Invalidation |
|---|---|---|---|---|
| **React Query Cache** | MMKV | 24 Hours | All server state, lists, details, tickets, visitors. | Garbage collection after 24h. Manual via `queryClient.invalidateQueries`. |
| **Membership Cache** | AsyncStorage | 24 Hours | User roles, organizations, and property access arrays. | Overwritten on background network fetch or explicit logout. |
| **Dashboard UI State** | Zustand Persist | Infinite | Dashboard specific UI metrics, offline widgets. | Updated atomically when new data arrives. |
| **Auth Session** | AsyncStorage | Supabase JWT | Secure token storage. | Handled by Supabase `gotrue` lifecycle. |

### **Why MMKV for React Query?**
MMKV is a synchronous, high-performance C++ key-value store. It allows React Query's `PersistQueryClientProvider` to instantly hydrate the cache on boot, whereas AsyncStorage would require asynchronous bridging over the React Native bridge.

---

## 6. React Query Architecture

All API data must flow through React Query (`@tanstack/react-query`).

### **Query Client Configuration**
- `staleTime`: 5 Minutes (Data is considered fresh for 5 mins; no background refetch triggered).
- `gcTime`: 24 Hours (Data is kept in MMKV for 24 hours before purging).
- `networkMode`: `'offlineFirst'` (Mutations and Queries will execute against the cache even if the device has no network).
- `refetchOnWindowFocus`: `false` (Mobile relies on `AppState` listeners, not window focus).

### **Prefetch Flow (`usePrefetchQueries.ts`)**
The `useSmartPrefetch` orchestrator controls network traffic based on priority:
1. **Critical Queries (Immediate)**: Dashboard stats, Recent Tickets, User Profile.
2. **Important Queries (InteractionManager)**: Deferred until screen transitions/animations finish (Checklists, Rooms, Stock).
3. **Background Queries (Delayed)**: Non-essential analytics and heavy lists.

---

## 7. Dashboard Loading Architecture

The dashboard provides the "First Meaningful Paint" for the user.

### **First Paint Strategy**
1. **Cached Dashboard Strategy**: Reads `dashboardStore` (Zustand) and React Query (MMKV) to paint widgets (e.g., Open Tickets: 12) instantly.
2. **Skeleton Strategy**: If the cache is empty (first-time login), lightweight `Skeleton` components from `ui/Skeleton.tsx` are rendered.
3. **Background Refresh**: The dashboard components register background `useQuery` hooks. Once the network returns, the UI updates smoothly without hard layout shifts.

---

## 8. State Management Architecture

State is strictly segregated based on its origin and persistence requirements.

### **1. Server State (React Query)**
- **What it is**: Data owned by the backend (Tickets, Properties, Users, Stock).
- **Rule**: NEVER copy server state into local state or Zustand. Read it directly via `useQuery`.

### **2. Global App State (AuthContext)**
- **What it is**: Who the user is, and what they have access to.
- **Rule**: Stored in `AuthContext` to avoid circular dependencies in hooks.

### **3. Persisted UI State (Zustand)**
- **What it is**: `useDashboardStore`.
- **Rule**: Used for caching dashboard counts and specific user preferences that need to survive app restarts. Uses atomic selectors (e.g., `useDashboardTickets()`) to prevent full-tree re-renders.

### **4. Ephemeral UI State (React `useState`)**
- **What it is**: Form inputs, modal open/close flags, active tabs.
- **Rule**: Keep it as close to the component as possible.

---

## 9. Offline Strategy

The app follows an **Offline-First** model.

1. **What works offline**: Users can view the dashboard, read recent tickets, view property details, and browse cached SOPs/Checklists.
2. **What is cached**: The last 24 hours of visited screens (via MMKV query hydration).
3. **Stale Data Handling**: UI displays cached data. When the network reconnects, React Query's background refetch automatically updates the UI.
4. **Synchronization**: Mutations (e.g., creating a ticket) use `networkMode: 'offlineFirst'`. Currently, mutations will fail if fully offline, but the UI is responsive. (Full optimistic offline queues are slated for future development).

---

## 10. Performance Optimizations

Summary of recent optimizations:
- **InteractionManager Deferral**: Heavy prefetching is deferred until native navigation animations complete, eliminating UI stutter on launch.
- **Font Timeout**: Prevents the app from freezing on the splash screen if Google Fonts are unreachable.
- **MMKV Sync Persister**: Replaced AsyncStorage for React Query, dropping hydration time from ~150ms to ~2ms.
- **Zustand Atomic Selectors**: Dashboard components now subscribe only to the specific slices of state they need, preventing cascading re-renders.

---

## 11. Future Development Standards

To maintain this architecture, all new features MUST adhere to the following rules:

> [!IMPORTANT]
> **Architecture Rules for Future Development**

1. **Must use React Query**: Do not use `useEffect` + `fetch` for data loading. You must use `useQuery` or `useMutation`.
2. **Must support cache hydration**: All queries must define a robust `queryKey` array in `utils/queryKeys.ts` so they can be persisted and prefetched.
3. **Must not block startup**: Never place `await networkCall()` in `_layout.tsx` or `AuthContext` initialization before rendering. Use fast-path cache reading.
4. **Must classify queries**: When adding a new module, add it to `hooks/queries/usePrefetchQueries.ts` and categorize it as Critical, Important (InteractionManager), or Background.
5. **Must use existing persistence**: Do not install new caching libraries. Use `queryClient` for server data, and `Zustand (persist)` for complex UI state.

---

## 12. File Reference Index

- **Startup & Layout**: `app/_layout.tsx`
- **Authentication & Membership**: `context/AuthContext.tsx`
- **React Query Cache Config**: `utils/queryClient.ts`
- **Query Keys Dictionary**: `utils/queryKeys.ts`
- **Prefetch Orchestrator**: `hooks/queries/usePrefetchQueries.ts`
- **Dashboard State**: `stores/dashboardStore.ts`
- **Property Service**: `services/propertyService.ts`
- **Ticket Service**: `services/ticketService.ts`
