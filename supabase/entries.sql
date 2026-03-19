-- Run this in Supabase SQL Editor after replacing the two emails.

create extension if not exists "pgcrypto";

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  content text not null check (char_length(content) between 1 and 5000),
  memory_date date not null default now()::date,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_draft boolean not null default false
);

create index if not exists entries_memory_date_idx on public.entries (memory_date desc);
create index if not exists entries_created_at_idx on public.entries (created_at desc);

create or replace function public.set_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_entries_set_updated_at on public.entries;
create trigger trg_entries_set_updated_at
before update on public.entries
for each row
execute function public.set_entries_updated_at();

alter table public.entries enable row level security;

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

drop policy if exists "entries_insert_policy" on public.entries;
create policy "entries_insert_policy"
on public.entries
for insert
to authenticated
with check (
  auth.uid() = author_id
  and auth.jwt()->>'email' in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);

drop policy if exists "entries_update_policy" on public.entries;
create policy "entries_update_policy"
on public.entries
for update
to authenticated
using (
  auth.uid() = author_id
  and auth.jwt()->>'email' in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
)
with check (
  auth.uid() = author_id
  and auth.jwt()->>'email' in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);

drop policy if exists "entries_delete_policy" on public.entries;
create policy "entries_delete_policy"
on public.entries
for delete
to authenticated
using (
  auth.uid() = author_id
  and auth.jwt()->>'email' in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);
