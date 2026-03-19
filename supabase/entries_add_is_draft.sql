-- Run once in Supabase SQL Editor.
-- Adds draft support to entries.

-- Add the column (defaults to false so all existing entries stay published)
alter table public.entries
  add column if not exists is_draft boolean not null default false;

-- Update select policy: users see their own drafts + all published entries
drop policy if exists "entries_select_policy" on public.entries;
create policy "entries_select_policy"
on public.entries
for select
to authenticated
using (
  lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
  and (
    is_draft = false
    or auth.uid() = author_id
  )
);
