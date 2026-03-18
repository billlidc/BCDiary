-- Run once in Supabase SQL Editor.
-- Creates profile table for custom nicknames and avatar URLs.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 40),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy"
on public.profiles
for select
to authenticated
using (
  lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);

drop policy if exists "profiles_upsert_policy" on public.profiles;
create policy "profiles_upsert_policy"
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = user_id
  and lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy"
on public.profiles
for update
to authenticated
using (
  auth.uid() = user_id
  and lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
)
with check (
  auth.uid() = user_id
  and lower(auth.jwt()->>'email') in (
    'billlidc0427@gmail.com',
    'cathy326717@gmail.com'
  )
);
