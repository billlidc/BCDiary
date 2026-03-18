# Cozy Shared Diary (Supabase + Next.js)

A soft, minimalist diary app for two people with:

- private login (only two allowed emails)
- timeline of memories
- "Add memory" button + form
- pastel aesthetic

## 1) Install and run

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## 2) Connect Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill values:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_ALLOWED_EMAILS=you@example.com,partner@example.com
```

## 3) Create the `entries` table + policies

1. Open Supabase SQL Editor.
2. Open `supabase/entries.sql`.
3. Replace:
   - `you@example.com`
   - `partner@example.com`
4. Run the SQL.

This creates:
- `entries` table
- indexes
- Row Level Security policies so only your two emails can access rows

## 4) Set up Auth for just the two of you

In Supabase dashboard:

1. Go to **Authentication -> Providers -> Email** and keep Email enabled.
2. Optionally disable open signups if you prefer pre-created users only.
3. Invite/create users for exactly the two emails from `NEXT_PUBLIC_ALLOWED_EMAILS`.

The app also checks the allowlist in UI, so any non-allowed email is blocked.

## 5) Using v0 UI

If you are generating UI pieces in v0:

- keep `src/components/DiaryApp.tsx` as your behavior/data layer
- paste generated visual sections into this component
- keep button handlers wired:
  - add memory button -> `setShowAddMemory(true)`
  - form submit -> `addMemory`
  - refresh -> `loadEntries`

## File map

- `src/app/page.tsx`: app entry
- `src/components/LoginScreen.tsx`: auth screen
- `src/components/DiaryApp.tsx`: timeline + add memory
- `src/lib/supabaseClient.ts`: Supabase client
- `src/lib/auth.ts`: allowed email logic
- `supabase/entries.sql`: table and RLS policies
