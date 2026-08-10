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

Run `supabase/schema.sql` in the Supabase SQL editor.

This schema allows anonymous read/write access because the app currently has no login. That makes the shared data simple, but not private. Add Supabase Auth and stricter RLS policies before putting sensitive data in it.

For local development, create `env.js` from `env.example.js` or run:

```sh
SUPABASE_URL="https://your-project-ref.supabase.co" SUPABASE_PUBLISHABLE_KEY="your-publishable-key" node scripts/create-env.js
```
