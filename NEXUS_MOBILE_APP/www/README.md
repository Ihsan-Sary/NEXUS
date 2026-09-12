# NEXUS V2 TEST

## What's new
- Accounts + cloud sync support through Supabase
- Separate guest and signed-in local caches
- Tasks
- Notes
- Calendar
- Goals with progress
- Lists with checkable items
- Money tracker
- Projects
- Global search (Ctrl/Cmd + K)
- Quick Add
- Offline shell + local-first storage
- Backup export/import
- Dark/light/system theme

## Run on Windows
Double-click `START_NEXUS.bat`.

## Test cloud accounts + sync
NEXUS works without cloud setup. For sync:

1. Create/obtain one Supabase project for the NEXUS app.
2. Open its SQL editor and run `SUPABASE_SETUP.sql` once.
3. In NEXUS, open Settings > Cloud sync.
4. Paste the Supabase Project URL and the PUBLIC publishable/anon key.
5. Save the connection.
6. Click the account button at the top and create/sign into a NEXUS account.

IMPORTANT: Use only the public publishable/anon key in NEXUS. Never use a service-role key in browser code.

If email confirmation is enabled in Supabase Auth, add your deployed NEXUS URL to the allowed redirect URLs. New users may need to confirm their email before signing in.

## Sync behavior
Each signed-in user has one protected `nexus_data` row. NEXUS stores its data locally for speed/offline use and writes the same payload to the user's cloud row. Row Level Security prevents authenticated users from reading or changing another user's row.

This test build uses a simple last-write-wins sync model. For a later production build, conflict merging and realtime subscriptions can be added.
