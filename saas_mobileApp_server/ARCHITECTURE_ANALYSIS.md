# Mobile Server Architecture Analysis

## 1. What `saas_one` is doing today

The `saas_one` project is already a Vercel-friendly Next.js backend with:

- `app/api/**` route handlers
- server-side Supabase anon client for user-scoped work
- service-role admin client for privileged flows
- module-specific routes for tickets, users, reports, procurement, VMS, PPM, meeting rooms, stock, SOP, and admin operations
- hybrid ticket classification using:
  - deterministic rules
  - confidence analysis
  - Groq tie-break / enrichment

That makes `saas_one` the right reference implementation for the new mobile server.

## 2. What the mobile app currently does

The mobile app currently has:

- direct Supabase reads/writes in services/hooks/context
- a partial API client in `utils/api/mobileApi.ts`
- some risky direct flows such as:
  - `supabase.auth.admin.*` in user management
  - notification / WhatsApp queue fan-out
  - workflow-heavy PPM and VMS side effects
  - reporting-style aggregations

## 3. Security rule for the new server

### Keep direct mobile -> Supabase only for:

- session/auth restore
- simple property-scoped reads
- simple list/detail fetches
- realtime subscriptions
- low-risk single-row writes that cleanly fit RLS

### Move behind server for:

- user creation / delete / role updates
- ticket creation with AI classification
- ticket media upload workflows
- approvals / procurement
- stock movements with audit logic
- PPM status workflows and notification fan-out
- VMS check-in/check-out workflows with side effects
- meeting room booking / credits
- reports / exports / aggregations
- anything using service-role privileges

## 4. If some low-latency calls stay direct, does security weaken?

Yes, potentially.

It depends on the class of call:

### Direct calls are still acceptable when:

- they use only anon key + user token
- RLS is strict
- the action is simple and local
- no privileged logic is hidden in the client

### Direct calls are not acceptable when:

- the client needs admin/service-role behavior
- the workflow touches multiple tables
- the workflow triggers notifications or queues
- the schema should be hidden from old mobile builds
- the action needs strict validation beyond RLS

So the correct model is not “everything direct” or “everything server”.
It is:

- direct for low-risk low-latency operations
- server for privileged and workflow-heavy operations

## 5. Module routing decision

### Server-required now

- Tickets: create, classify, assign, upload media, bulk operations
- Users: list/create/update role/delete/invite
- Procurement: approvals and request state changes
- Reports: requests report, snag report, executive summaries
- Meeting rooms: booking creation, credits, refill logic
- PPM: schedule mutation, import, audit, attachments
- VMS: secure check-in flow, host notification flow, photo uploads
- Stock: movement logging, barcode/report flows if audit matters
- SOP: completion submission where audit or media exists

### Direct-safe for now

- auth session operations
- property access restoration
- basic ticket lists
- basic stock lists
- meeting room list views
- simple visitor list views

## 6. New server direction

This repo now includes a new project:

- [saas_mobile_server](</D:/Projects/Autopilot Mobile app/fms--native-/saas_mobile_server>)

It is designed as:

- Next.js route handlers on Vercel
- bearer-token auth from mobile
- anon client for user-scoped queries
- admin client for privileged operations
- reusable classification logic shared from the web architecture

## 7. Implemented first

Implemented in this pass:

- server skeleton
- health route
- bearer auth utility
- property-access route
- ticket list route
- ticket creation route with AI classification
- ticketing rule/confidence/LLM resolver stack

## 8. Next server ports to add

Priority order:

1. `users/list`, `users/create`, `users/update-role`
2. `tickets/[id]/photos`, `tickets/[id]/comments`, `tickets/[id]/assign`
3. `procurement/requests`, `procurement/requests/[id]`
4. `meeting-rooms`, `meeting-room-bookings`, `meeting-room-credits`
5. `reports/requests-report`, `reports/snag-report/[importId]`
6. `vms/[propertyId]` and host/photo/check-out helpers
7. `ppm/schedules`, `ppm/upload`, `ppm/reports`

## 9. Important architecture warning

Do not move `SUPABASE_SERVICE_ROLE_KEY` logic into the mobile app runtime.

It must stay server-only.
