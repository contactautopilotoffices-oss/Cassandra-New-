# Vercel Deployment Steps

## Goal

Replace the current Vercel project content behind the shared domain with this new mobile server.

Target shown in your screenshot:

- project: `saas-testing`
- domain: `www.back2basiics.com`

## Step 1: Protect the current deployment

Before replacing anything:

1. Open the current Vercel project.
2. Confirm the current production branch.
3. Export current environment variables.
4. Note the current domain assignment.
5. If the old code is still needed, keep a backup branch or zip.

## Step 2: Point Vercel to the new server folder

You have two safe options.

### Option A: Replace repo root mapping in the same Vercel project

Use this if the project already points to the same Git repo.

1. In Vercel project settings, change the Root Directory to:
   - `fms--native-/saas_mobile_server`
2. Keep the same production branch if desired.
3. Save settings.

### Option B: Replace files in the currently linked project/repo branch

Use this if that Vercel project is tied to a branch/repo layout you want to reuse exactly.

1. Commit the new `saas_mobile_server` folder.
2. Update the Vercel project root to that folder.
3. Remove old server files only after the new root is confirmed.

Option A is safer because it does not require destructive file deletion first.

## Step 3: Configure environment variables

Set these in the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`

If you add more module routes later, you may also need:

- WhatsApp provider keys
- email provider keys
- storage/bucket variables
- cron/auth secrets

## Step 4: Build and verify

After config:

1. Trigger a deploy.
2. Verify:
   - `/api/health`
   - `/api/auth/property-access?propertyId=<id>`
   - `GET /api/tickets`
   - `POST /api/tickets`

## Step 5: Move mobile app to the new server

Update the mobile app env:

- `EXPO_PUBLIC_WEB_API_URL=https://www.back2basiics.com`

Then migrate route-by-route from old API/direct Supabase to this new server.

## Step 6: Remove old files

Only remove old hosted files after:

1. new server deploy is healthy
2. environment variables are confirmed
3. health route works on production domain
4. ticket create/list and auth/property-access work from the mobile app

## Step 7: Suggested rollout

### Phase 1

- deploy server
- verify health
- route ticket creation and property access to new server

### Phase 2

- migrate users, reports, procurement, meeting rooms

### Phase 3

- migrate VMS, PPM, stock workflows

### Phase 4

- reduce remaining risky direct mobile DB writes

## Step 8: If the old project must be fully replaced

If you truly want to remove old files in the existing deployment target:

1. confirm the old deployment is no longer needed
2. change Vercel root directory to `saas_mobile_server`
3. deploy new server
4. verify production routes
5. only then delete old source files or old folders from the previous app branch

The key point:

Do not delete first and hope the new server works afterward.
Switch root, deploy, verify, then clean up.
