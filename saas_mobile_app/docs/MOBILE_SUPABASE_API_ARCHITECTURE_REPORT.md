# Mobile Supabase and API Architecture Report

## Executive Summary

The current mobile app uses a hybrid data access model:

- Many screens and services call Supabase directly from the mobile client.
- Some flows already go through a web-based API layer.

This is a workable starting point, but it creates long-term complexity if the split keeps growing without a clear rule. The biggest decision is not "Supabase or server" in the abstract. The real decision is which responsibilities should stay in the mobile client, and which should move behind an API boundary for security, consistency, and future maintainability.

In this codebase today:

- Direct Supabase usage is widespread.
- A web API access layer already exists.
- There is also an admin Supabase client in the mobile repository tree, which is a security concern unless it is kept strictly server-only.

My recommendation is a controlled hybrid model:

1. Keep direct Supabase access for simple, low-risk, user-scoped reads and writes that fit cleanly under Row Level Security (RLS).
2. Move business-critical workflows, cross-table mutations, approvals, role-sensitive actions, audit-heavy operations, and any admin capability behind a server or web API.
3. Standardize rules for future development so new features do not randomly choose one pattern or the other.

That gives the team a path that is safer than direct-only, while avoiding the cost of moving everything to a backend immediately.

## What the Current Mobile Codebase Is Doing

### 1. Direct Supabase from mobile is already a major pattern

The app has a shared Supabase client in:

- [utils/supabase/client.ts](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/utils/supabase/client.ts>)

This client:

- reads `EXPO_PUBLIC_SUPABASE_URL`
- reads `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- persists auth state in browser storage or React Native AsyncStorage
- exposes a singleton client for use across the app

Across the mobile codebase, there are many direct calls such as:

- `supabase.from(...)`
- `supabase.auth.*`
- `supabase.rpc(...)`
- `supabase.storage.*`

Based on a code search, there are about `167` direct Supabase touchpoints in the app, components, context, hooks, services, and utils folders.

Examples include:

- [context/AuthContext.tsx](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/context/AuthContext.tsx>)
- [services/ticketService.ts](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/services/ticketService.ts>)
- [services/propertyService.ts](</D:/Projects\Autopilot Mobile app\fms--native-\saas_mobile\services\propertyService.ts>)
- [services/meetingRoomService.ts](</D:/Projects\Autopilot Mobile app\fms--native-\saas_mobile\services\meetingRoomService.ts>)
- [services/vmsService.ts](</D:/Projects\Autopilot Mobile app\fms--native-\saas_mobile\services\vmsService.ts>)
- [services/stockService.ts](</D:/Projects\Autopilot Mobile app\fms--native-\saas_mobile\services\stockService.ts>)
- [hooks/useOrgData.ts](</D:/Projects\Autopilot Mobile app\fms--native-\saas_mobile\hooks\useOrgData.ts>)
- many route screens under [app](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/app>)

### 2. A web API layer already exists

The mobile app also contains a utility for calling a web API:

- [utils/api/mobileApi.ts](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/utils/api/mobileApi.ts>)

This file:

- fetches a Supabase access token from the mobile session
- sends it as a Bearer token
- calls a web API base URL from `EXPO_PUBLIC_WEB_API_URL`
- falls back to `https://fms-dev-saas-one.vercel.app`

It already supports operations like:

- ticket creation
- ticket listing
- property access checks
- meeting room endpoints
- reports and procurement style APIs

Based on code search, there are about `107` web-API style touchpoints in the mobile code.

That means the app is not direct-only. It is already a hybrid architecture.

### 3. There is a server-only security risk sitting in the mobile repo tree

There is an admin client here:

- [utils/supabase/admin.ts](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/utils/supabase/admin.ts>)

This uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS.

That is acceptable only if it is used strictly in server-side code and never bundled into the client app. If mobile code imports it directly, the impact would be severe because service-role access effectively becomes full database access.

Even if it is not currently bundled, its presence inside the mobile repository is an architectural smell. It increases the chance of accidental misuse in future updates.

## Option A: Direct Mobile to Supabase

This means the mobile app talks directly to Supabase using the anon key and user session, relying on RLS, Supabase Auth, Storage, and RPCs.

### Advantages

#### 1. Faster development for CRUD-heavy apps

For simple create/read/update/delete flows, this is usually the fastest way to ship:

- less backend code
- less deployment coordination
- fewer moving parts
- faster prototyping

This is especially strong for:

- dashboards
- list/detail views
- user profile data
- user-scoped uploads
- tenant-level task lists
- simple calendar reads

#### 2. Lower infrastructure and maintenance cost

You do not need to maintain a large custom backend layer for every feature.

Benefits:

- fewer services to monitor
- fewer API contracts to version
- fewer server bugs
- smaller DevOps footprint

For a lean team, this matters a lot.

#### 3. Real-time features are easier

Supabase gives direct support for:

- auth
- database access
- storage
- realtime subscriptions

If the app needs live updates for tickets, work orders, dashboards, visitor status, or room availability, direct integration can be very productive.

#### 4. RLS can be a strong security model when designed well

If every table has correct RLS policies, and all actions stay inside those policies, direct client access can be secure enough for many operations.

The main idea is:

- the mobile app never gets admin credentials
- the app only uses user session tokens
- the database decides what that user can read or write

#### 5. Less API duplication

Without a custom server, you avoid writing:

- database queries once in client logic
- and then again in backend handlers

That reduces duplication for simple screens.

### Disadvantages

#### 1. Business logic spreads into the mobile app

As the system grows, the client often ends up owning logic like:

- role checks
- property scope checks
- workflow transitions
- approval rules
- status rules
- multi-step inserts and updates

That makes the mobile app heavier and harder to maintain. It also leads to inconsistent behavior if web and mobile implement the same rules separately.

This risk is already visible in this codebase because both direct Supabase calls and web-API calls coexist.

#### 2. Security depends heavily on perfect RLS and query design

Direct Supabase is only safe when:

- RLS exists on every sensitive table
- policies are correct
- joins and RPCs are correctly scoped
- no privileged key leaks
- no unintended broad selects are exposed

That means the database becomes the main security boundary. If RLS is incomplete, the mobile client can accidentally gain broader access than intended.

#### 3. Harder to hide internal schema changes

When the mobile client directly queries database tables, the app becomes tightly coupled to:

- table names
- column names
- relationships
- RPC names
- data shape

If the schema changes, mobile builds may need updates. That is more painful in mobile than web because users do not all upgrade immediately.

This is one of the biggest long-term disadvantages.

#### 4. Versioning becomes harder

Suppose you rename:

- a column
- a status enum
- an RPC
- a relationship path

Older installed mobile apps may break if they still expect the previous shape.

With direct database access, backward compatibility becomes a database responsibility. That can slow down schema evolution.

#### 5. Client-side performance can degrade on complex workflows

For simple queries, direct access is fine. For complex workflows, the client may need:

- multiple round trips
- nested lookups
- client-side joins
- ad hoc transaction-like sequences

That can lead to:

- slow screens
- race conditions
- inconsistent partial updates

#### 6. Audit, rate limiting, and centralized observability are weaker

With direct calls, it is harder to consistently add:

- detailed audit logs
- IP/device-based checks
- rate limiting
- bot protection
- request correlation
- unified error analytics by endpoint

Some of this can still be done with database logs or edge functions, but it is usually less straightforward than in a dedicated API layer.

### Best Fit for Direct Supabase

Direct Supabase is a good fit for:

- profile screens
- user-scoped settings
- simple reference data reads
- lightweight lists
- uploads where Storage policies are clear
- low-risk data mutations with strong RLS

It is a weaker fit for:

- approval workflows
- billing or finance logic
- org-wide admin functions
- cross-property management
- sensitive role elevation
- complex workflow orchestration
- anything using service-role permissions

## Option B: Mobile to Web-Based API

This means the mobile app does not talk to the database directly for certain workflows. Instead, it calls a web API that validates the user token and performs the operation on the server side.

This pattern already exists in:

- [utils/api/mobileApi.ts](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/utils/api/mobileApi.ts>)

### Advantages

#### 1. Stronger control over business logic

A server API lets the team keep business rules in one place:

- access validation
- workflow validation
- field normalization
- cross-table transactions
- side effects
- notifications
- audit logging

This is the biggest architectural advantage.

#### 2. Easier future schema changes

The mobile app can keep calling the same API contract even if the underlying database changes.

That means:

- rename columns internally without breaking old app versions
- change table structure
- move logic into different tables
- merge or split entities
- evolve data models with less mobile release pressure

This is very important for future updates.

#### 3. Better compatibility with old mobile app versions

Mobile users upgrade slowly. A stable API helps the backend absorb change while older clients still work.

This is one of the strongest reasons to add a server layer as the product matures.

#### 4. Easier security hardening

Server APIs make it easier to enforce:

- centralized authorization checks
- audit trails
- rate limiting
- anomaly detection
- stricter validation
- hidden internal fields

The client sees only the contract you want to expose.

#### 5. Better place for orchestration and integrations

If a workflow requires:

- multiple DB writes
- external APIs
- email or push notification side effects
- document generation
- ML or classification steps
- admin-only actions

an API layer is usually the right place.

### Disadvantages

#### 1. More development and maintenance effort

You now have:

- mobile code
- API handlers
- server-side auth validation
- deployment concerns
- endpoint versioning
- monitoring for another layer

This is not free.

#### 2. Risk of duplicated logic during migration

If migration is partial, teams often keep:

- direct client queries in one part
- API endpoints in another
- slightly different business rules in each

That creates inconsistency unless ownership rules are defined clearly.

This is a real risk for this codebase because the hybrid pattern already exists.

#### 3. More latency for simple operations

A simple read can become:

mobile -> API -> database -> API -> mobile

instead of:

mobile -> database

For very simple low-risk reads, this can be unnecessary overhead.

#### 4. Backend becomes a delivery dependency

If the API team is blocked, the mobile team may also be blocked.

To avoid this, contracts and ownership need to be defined well.

### Best Fit for Web API

A web API is a good fit for:

- ticket creation with classification
- approval flows
- PPM schedule generation/import
- workflow transitions
- reporting aggregation
- stock movements
- vendor or procurement flows
- role-based admin operations
- anything with nontrivial validation

## Option C: Dedicated Backend Server for Security

This means going further than a few API routes and building a more explicit backend or BFF (Backend for Frontend), where the mobile app primarily talks to your server and the server talks to Supabase or other systems.

This can be a Next.js API layer, Node service, NestJS backend, Express service, edge functions, or a more formal microservice setup.

### Advantages

#### 1. Strongest control over security boundaries

A dedicated server is the safest place for:

- service-role access
- admin-only workflows
- privileged data repair
- complex org-wide actions
- secrets for third-party integrations

This sharply reduces the amount of sensitive logic in the client.

#### 2. Clear separation of concerns

The client becomes responsible for:

- UI
- local state
- user interaction
- request handling

The server becomes responsible for:

- authorization
- data orchestration
- validation
- side effects
- audit logging
- schema abstraction

This scales better organizationally.

#### 3. Better long-term upgrade story

If mobile app versions remain in the wild for months, a server layer can preserve compatibility while the database evolves.

That is often the deciding factor for serious mobile products.

#### 4. Better observability and support tooling

A dedicated server can provide:

- request tracing
- structured logs
- retry handling
- operational dashboards
- better incident debugging
- central feature flags

This becomes more valuable as usage grows.

### Disadvantages

#### 1. Highest operational overhead

You now own:

- hosting
- scaling
- error monitoring
- deployment pipelines
- endpoint versioning
- server performance
- security patching
- operational on-call complexity

This is the biggest cost.

#### 2. More code and longer delivery time

The same feature now often requires changes in:

- mobile UI
- client API wrapper
- backend endpoint
- backend tests
- sometimes DB schema

That slows down teams if process discipline is weak.

#### 3. Potential over-engineering

Not every app needs a full backend facade for every screen. If the team moves everything behind a server too early, simple screens become slower to build and harder to maintain.

#### 4. A server can become a bottleneck if poorly designed

Common problems include:

- too many thin pass-through endpoints
- duplicated validation
- unstable API contracts
- over-centralized approval from one backend owner
- backend outages affecting all clients

A server improves security only when it is designed and maintained well.

## Security Comparison

### Direct mobile to Supabase

Security depends mainly on:

- correct RLS
- correct auth usage
- safe storage policies
- no privileged keys in client bundles

This can be strong, but only with disciplined schema and policy management.

### Mobile to web API

Security depends on:

- token validation
- secure server logic
- careful authorization in endpoints
- correct use of Supabase on the server

This is usually easier to reason about for business workflows because the access rules live in application code, not only in SQL policies.

### Dedicated backend server

This gives the best control for sensitive operations, but only if:

- server code is well reviewed
- secrets are isolated
- logs are monitored
- the system has clear ownership

## Future Update Management

This is the area where a server or API layer gives the largest strategic benefit.

### Problem with direct Supabase for future updates

When the app directly depends on database schema, every mobile version effectively becomes coupled to:

- table shape
- enum values
- relationship paths
- RPC signatures
- field names

That makes future updates harder because old app versions may still call old schema patterns.

Examples of risky updates:

- rename `planned_date` to another field
- split one table into two
- move business logic from client query patterns to a different structure
- change a ticket classification response shape

With direct access, the DB must often support both old and new shapes longer than desired.

### How a web API helps future updates

If the mobile client calls stable endpoints such as:

- `POST /api/tickets`
- `GET /api/ppm/schedules`
- `POST /api/stock/movements`

then the backend can change internal table design without forcing a mobile release at the same time.

This gives:

- API contract stability
- backend-controlled migrations
- easier rollback
- better compatibility with older apps

### Best practice for future-proofing

For this app, future-proofing should mean:

1. Define which tables or workflows are safe for direct access.
2. Define which workflows must always go through an API.
3. Create stable DTOs or response shapes for API features.
4. Avoid exposing raw database shape unnecessarily to the mobile UI layer.
5. Keep schema change notes tied to mobile compatibility.
6. Add a deprecation window before removing old fields or RPCs.

## Practical Problems if You Build a Server

If you decide to add or expand a server for security, these are the real problems the team will face:

### 1. More ownership boundaries

Someone must own:

- endpoint design
- auth validation
- release process
- incident response

Without clear ownership, the server becomes a confusion layer.

### 2. Migration complexity

Moving from direct Supabase to API endpoints is rarely all-at-once.

The team will need to manage:

- mixed client patterns for a while
- regression risk
- duplicated types
- phased rollout
- temporary compatibility code

### 3. Performance design work

The API needs:

- pagination rules
- caching where appropriate
- batching for expensive views
- sensible response shapes

Otherwise the server can become slower than direct access without giving enough benefit.

### 4. Operational maturity requirements

If the team does not yet have:

- logging discipline
- monitoring
- release discipline
- test coverage on business workflows

then adding a backend can expose those gaps quickly.

## Recommended Architecture for This Codebase

The strongest recommendation is not "move everything to server" and not "stay direct everywhere."

The best next step is a rules-based hybrid architecture.

### Keep direct Supabase for:

- authenticated user profile reads and updates
- simple property-scoped lists
- lightweight dashboard reads
- simple calendar/list reads under strong RLS
- storage uploads where policy boundaries are clear

### Move behind API/server for:

- ticket creation and classification
- role-sensitive property assignment checks
- PPM generation/import/repair flows
- stock transactions and approval chains
- procurement and vendor workflows
- audit-sensitive writes
- organization-wide reports and aggregation
- any operation that needs service-role access
- any cross-table workflow with more than one important side effect

### Hard rule

The mobile app should never directly use a service-role key.

Anything requiring:

- admin privileges
- RLS bypass
- privileged maintenance
- cross-tenant repair

must stay server-side only.

## Migration Strategy

### Phase 1: Stabilize architecture rules

Create a short engineering standard:

- "direct access allowed for these categories"
- "API required for these categories"
- "service-role forbidden in mobile runtime"

This is the biggest immediate value because it stops future drift.

### Phase 2: Centralize mobile data access

Even before migrating everything, reduce chaos by routing access through a few modules:

- direct Supabase repositories
- API client modules

UI screens should not each invent their own access pattern.

### Phase 3: Move sensitive workflows first

Prioritize server/API migration for:

1. admin operations
2. workflow-heavy writes
3. cross-table transactions
4. reports and aggregations
5. anything currently hard to secure with RLS alone

### Phase 4: Add compatibility discipline

For future updates:

- version important endpoints when needed
- keep response contracts stable
- add deprecation windows
- document mobile compatibility expectations per release

### Phase 5: Remove dangerous code paths

Review and isolate:

- [utils/supabase/admin.ts](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/utils/supabase/admin.ts>)

If this file is needed, move it into a clearly server-only location and ensure it cannot be imported into client bundles.

## Decision Matrix

| Area | Direct Supabase | Web API | Dedicated Backend |
|---|---|---|---|
| Speed to build simple CRUD | High | Medium | Low to Medium |
| Security for sensitive workflows | Medium, depends on RLS | High | Highest |
| Flexibility for future schema changes | Low to Medium | High | High |
| Mobile backward compatibility | Low to Medium | High | High |
| Operational overhead | Low | Medium | High |
| Real-time simplicity | High | Medium | Medium |
| Audit and centralized rules | Low to Medium | High | High |
| Fit for admin workflows | Weak | Strong | Strongest |

## Final Recommendation

For this project, the best direction is:

- do not keep growing direct Supabase access everywhere
- do not force an immediate full backend rewrite
- adopt a disciplined hybrid model now

In practice, that means:

1. Keep direct Supabase for simple, RLS-safe, user-scoped interactions.
2. Use the existing web API pattern for business-critical and role-sensitive workflows.
3. Treat server-side privileged access as a separate security boundary.
4. Standardize future development so schema evolution does not keep breaking mobile assumptions.

If the app is expected to grow in operational complexity, multiple roles, approvals, organization-level control, and long-lived mobile versions, then the architecture should gradually move toward a stronger backend-for-frontend model over time.

That gives the team the best balance of:

- delivery speed
- security
- maintainability
- upgrade safety
- future scalability

