-- Run once in Supabase SQL Editor.
-- Adds comments on diary entries.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_entry_id_idx on public.comments (entry_id);
create index if not exists comments_created_at_idx on public.comments (created_at asc);

alter table public.comments enable row level security;

drop policy if exists "comments_select_policy" on public.comments;
create policy "comments_select_policy"
on public.comments
for select
to authenticated
using (
  lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);

drop policy if exists "comments_insert_policy" on public.comments;
create policy "comments_insert_policy"
on public.comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);
