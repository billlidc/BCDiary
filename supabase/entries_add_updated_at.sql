-- Run once in Supabase SQL Editor.
-- Adds updated_at support so edited memories can show an "Edited" timestamp.

alter table public.entries
add column if not exists updated_at timestamptz not null default now();

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
