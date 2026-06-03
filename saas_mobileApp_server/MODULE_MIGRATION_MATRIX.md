# Module Migration Matrix

## Direct-safe vs server-required

| Module | Direct Supabase OK? | Move to Server? | Reason |
|---|---|---|---|
| Auth session | Yes | Optional | Standard token/session operations |
| Property access check | No preferred | Yes | Centralized authorization logic |
| Ticket list/detail | Yes, selectively | Yes for consistency later | Low-risk reads can stay direct initially |
| Ticket creation | No | Yes | Classification, validation, future side effects |
| Ticket photo upload | No | Yes | Storage policy, validation, audit |
| Ticket assign/bulk assign | No | Yes | Workflow control |
| Ticket comments | Maybe | Prefer yes | Audit and moderation later |
| User list | Maybe | Prefer yes | Role visibility consistency |
| User create/delete/update role | No | Yes | Admin auth and service-role operations |
| Procurement approvals | No | Yes | Approval workflow and audit |
| Reports/export | No | Yes | Aggregation and compatibility |
| Meeting room list | Yes | Optional | Simple read |
| Meeting room booking | No | Yes | Overlap checks, credit logic |
| Meeting room credits | No | Yes | Financial/quota logic |
| Stock list | Yes | Optional | Simple read |
| Stock movements | No | Yes | Audit + transactional consistency |
| VMS list | Yes | Optional | Simple read |
| VMS secure check-in/check-out | No | Yes | ID generation + notifications |
| PPM calendar reads | Yes | Optional | Read-heavy and RLS-safe |
| PPM status update / import | No | Yes | Workflow + notifications |
| SOP template reads | Yes | Optional | Low-risk reads |
| SOP completion submit | Maybe | Prefer yes | Audit and media association |

## Current mobile API contract to preserve

The mobile app already expects these families:

- `/api/tickets`
- `/api/super-tenant`
- `/api/mst/gamification/*`
- `/api/auth/property-access`
- `/api/reports/requests-report`
- `/api/reports/snag-report/[importId]`
- `/api/procurement/requests`
- `/api/tickets/[id]/photos`
- `/api/users/list`
- `/api/users/create`
- `/api/users/update-role`
- `/api/meeting-rooms`
- `/api/meeting-room-bookings`
- `/api/meeting-room-credits`

These should be the first compatibility targets for the new mobile server.

## Implemented in this server scaffold

- `/api/health`
- `/api/auth/property-access`
- `/api/tickets`
- `/api/reports/requests-report`
- `/api/users/list`
- `/api/users/create`
- `/api/users/update-role`
- `/api/meeting-room-bookings`
- `/api/meeting-room-credits`
- `/api/meeting-rooms`
- `/api/super-tenant`
- `/api/reports/snag-report/[importId]`
- `/api/procurement/requests`
- `/api/procurement/requests/[id]`
- `/api/tickets/[id]/photos`
- `/api/mst/gamification/leaderboard`
- `/api/mst/gamification/my-stats`

## Still to port next

- VMS and PPM workflow endpoints
