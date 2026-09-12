-- Run this once in the Supabase SQL editor for the NEXUS backend.

create table if not exists public.nexus_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nexus_data enable row level security;

grant select, insert, update, delete on table public.nexus_data to authenticated;

drop policy if exists "NEXUS users can read own data" on public.nexus_data;
drop policy if exists "NEXUS users can insert own data" on public.nexus_data;
drop policy if exists "NEXUS users can update own data" on public.nexus_data;
drop policy if exists "NEXUS users can delete own data" on public.nexus_data;

create policy "NEXUS users can read own data"
on public.nexus_data for select
using (auth.uid() = user_id);

create policy "NEXUS users can insert own data"
on public.nexus_data for insert
with check (auth.uid() = user_id);

create policy "NEXUS users can update own data"
on public.nexus_data for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "NEXUS users can delete own data"
on public.nexus_data for delete
using (auth.uid() = user_id);
