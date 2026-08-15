# todo-app

A small static to-do app ready to publish on Netlify.

## Files

```text
index.html
styles.css
app.js
assets/
  app-icon.svg
supabase/
  schema.sql
```

## Netlify

Netlify runs a tiny build step to generate `env.js` from environment variables.

Use these settings if deploying from GitHub:

```text
Build command: node scripts/create-env.js
Publish directory: .
```

Add these Netlify environment variables:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

`SUPABASE_ANON_KEY` also works as a fallback name for older Supabase docs.

Do not use a Supabase secret key in this app.

## Supabase

For a new database, run `supabase/schema.sql` in the Supabase SQL editor.

For an existing installation of this app, run
`supabase/migrations/202608150001_add_todo_users.sql` once instead. It assigns
all existing lists and items to the first generated user (`USER1`) and creates
the seven-day user-deletion job. Then run
`supabase/migrations/202608150002_remove_global.sql` to remove the retired
global fields from an already-migrated database.

Users are organizational tabs, not login identities. The active user and list
are remembered in browser local storage. A user with no items is deleted
immediately along with any empty lists; otherwise it is hidden and scheduled
for permanent deletion one week later. An administrator can restore it before then by setting
`todo_users.deletion_at` to `NULL` in Supabase.

Adding a user creates a default `To do` list and immediately selects its
generated `USER{id}` name for editing. Right-click an item on desktop or
long-press it on touch devices to delete it. Item titles are saved to Supabase
only when editing is confirmed by pressing Enter or leaving the field.

The schema enables Supabase Cron (`pg_cron`) for the scheduled cleanup. If the
extension is unavailable for the project, configure an equivalent daily server
job to delete rows where `deletion_at <= now()`.

This schema allows anonymous read/write access because the app currently has no login. That makes the shared data simple, but not private. Add Supabase Auth and stricter RLS policies before putting sensitive data in it.

For local development, create `env.js` from `env.example.js` or run:

```sh
SUPABASE_URL="https://your-project-ref.supabase.co" SUPABASE_PUBLISHABLE_KEY="your-publishable-key" node scripts/create-env.js
```
