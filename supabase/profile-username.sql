-- Usernames for Intaliq profiles.
-- Run once in Supabase: Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.

alter table public.profiles
  add column if not exists username text;

-- 3-20 characters: lowercase letters, numbers, dots and underscores, starting with a letter or number.
alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._]{2,19}$');

-- One account per username, ignoring case.
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

-- Lets the app check a username before saving, without needing to read other people's profiles.
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(candidate)
      and id is distinct from auth.uid()
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
