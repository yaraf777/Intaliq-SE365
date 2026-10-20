-- Admin accounts, coach vetting and moderation tools for Intaliq.
-- Run once in Supabase: Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.
-- Run profile-username.sql first.
--
-- Admin rights live in profiles.is_admin, never in auth user_metadata: users can
-- write their own metadata (and their own profiles row), so anything stored there
-- can't be trusted. Every admin action goes through a security definer function
-- below that checks is_admin on the server and writes an audit log entry.
--
-- Coaches are vetted: signing up as a coach files an application and the account
-- stays a member until an admin approves it. Only coaches can create sessions.
-- Accounts that are already coaches when this runs are approved automatically.
--
-- To make the first admin, sign up in the app, finish profile setup, then run
-- the statement at the very bottom of this file with that account's email.

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_suspended boolean not null default false;

-- Moderation notes are private. profiles is readable by every signed-in user
-- (the partner directory lists it), so reasons live here instead, readable only
-- through the admin functions.
create table if not exists public.account_moderation (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suspended_reason text,
  suspended_at timestamptz,
  suspended_by uuid references auth.users (id) on delete set null
);

alter table public.account_moderation enable row level security;
revoke all on public.account_moderation from anon, authenticated;

-- An earlier version of this file kept the reason on profiles; move it over.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_reason') then
    execute $move$
      insert into public.account_moderation (user_id, suspended_reason, suspended_at)
      select id, suspended_reason, suspended_at from public.profiles where is_suspended
      on conflict (user_id) do nothing
    $move$;
    alter table public.profiles drop column suspended_reason;
    alter table public.profiles drop column if exists suspended_at;
  end if;
end;
$$;

-- One row per account that has asked to coach. Applicants can read their own
-- row (to see the decision and note); only the functions below write to it.
create table if not exists public.coach_applications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_applications enable row level security;
revoke insert, update, delete, truncate on public.coach_applications from anon, authenticated;

drop policy if exists "Applicants can read their own coach application" on public.coach_applications;
create policy "Applicants can read their own coach application"
  on public.coach_applications for select to authenticated using (user_id = auth.uid());

-- Existing coaches keep coaching. Older coach accounts only had a specialty, so
-- give those the coach role too.
update public.profiles
  set role = 'coach'
  where role is null and coalesce(specialty, '') <> '';

insert into public.coach_applications (user_id, status, review_note, reviewed_at)
  select id, 'approved', 'Coach before vetting started', now()
  from public.profiles
  where role = 'coach'
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin and not is_suspended from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_suspended from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'coach' and not is_suspended from public.profiles where id = auth.uid()), false);
$$;

-- Files a coach application for the signed-in account, or re-files one that was
-- turned down. Called by the app's "Apply again" button and by the profiles
-- trigger when someone signs up as a coach.
create or replace function public.apply_as_coach()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to apply as a coach.' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'Suspended accounts can''t apply to coach.' using errcode = '42501';
  end if;

  select status into current_status from public.coach_applications where user_id = auth.uid();
  if current_status in ('pending', 'approved') then
    return current_status;
  end if;

  insert into public.coach_applications (user_id, status)
    values (auth.uid(), 'pending')
  on conflict (user_id) do update
    set status = 'pending', review_note = null, reviewed_by = null, reviewed_at = null,
        created_at = now(), updated_at = now();
  return 'pending';
end;
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_suspended() from public, anon;
revoke execute on function public.is_coach() from public, anon;
revoke execute on function public.apply_as_coach() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_suspended() to authenticated;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.apply_as_coach() to authenticated;

-- Users keep editing their own profile through the API, but they can't touch the
-- admin and suspension columns, and they can't make themselves a coach: asking
-- for the coach role files an application and keeps the account a member until
-- an admin approves it. Admin functions and the SQL Editor run as the database
-- owner, so they're allowed through.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.is_suspended := false;
  elsif new.is_admin is distinct from old.is_admin
    or new.is_suspended is distinct from old.is_suspended then
    raise exception 'Only admins can change admin or suspension settings.'
      using errcode = '42501';
  end if;

  if new.role = 'coach' and (tg_op = 'INSERT' or old.role is distinct from 'coach') then
    if not exists (select 1 from public.coach_applications where user_id = new.id and status = 'approved') then
      -- Only file a new application; a rejected or revoked one stays that way
      -- until the person taps "Apply again".
      if not exists (select 1 from public.coach_applications where user_id = new.id) then
        perform public.apply_as_coach();
      end if;
      new.role := 'member';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_admin_fields on public.profiles;
create trigger protect_profile_admin_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- Suspended accounts can still read, but can't create or change anything.
-- These are restrictive policies, so they only narrow whatever policies the
-- tables already have. They take effect on tables with RLS enabled.
do $$
declare
  target text;
  command text;
begin
  foreach target in array array['profiles', 'app_sessions', 'app_session_requests'] loop
    foreach command in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists "Suspended users are read-only (%s)" on public.%I', command, target);
      if command = 'insert' then
        execute format(
          'create policy "Suspended users are read-only (%s)" on public.%I as restrictive for insert to authenticated with check (not public.is_suspended())',
          command, target);
      else
        execute format(
          'create policy "Suspended users are read-only (%s)" on public.%I as restrictive for %s to authenticated using (not public.is_suspended())',
          command, target, command);
      end if;
    end loop;
  end loop;
end;
$$;

-- Only approved coaches (and admins) can create sessions. Members still update
-- existing sessions when they join, which this doesn't affect: for an upsert,
-- Postgres only checks insert policies when a new row is actually added.
drop policy if exists "Only coaches create sessions" on public.app_sessions;
create policy "Only coaches create sessions"
  on public.app_sessions as restrictive for insert to authenticated
  with check (public.is_coach() or public.is_admin());

-- Announcements from the Intaliq team, shown to every signed-in user.
create table if not exists public.app_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.app_announcements enable row level security;
-- Supabase grants table writes to API roles by default; announcements are only written through the admin functions.
revoke insert, update, delete, truncate on public.app_announcements from anon, authenticated;

drop policy if exists "Signed-in users can read announcements" on public.app_announcements;
create policy "Signed-in users can read announcements"
  on public.app_announcements for select to authenticated using (true);

-- Every admin action, newest first. Only admins can read it; nobody can edit it.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  target_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
revoke insert, update, delete, truncate on public.admin_audit_log from anon, authenticated;

drop policy if exists "Admins can read the audit log" on public.admin_audit_log;
create policy "Admins can read the audit log"
  on public.admin_audit_log for select to authenticated using (public.is_admin());

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_target_label text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, target_label, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_target_label, coalesce(p_details, '{}'::jsonb));
$$;

-- Label for a user in the audit log, e.g. "@shoug".
create or replace function public.profile_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce('@' || p.username, p.full_name, u.email, p_user::text)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user;
$$;

-- Keeps the role in the account's metadata in step with profiles, since the app reads both.
create or replace function public.sync_role_metadata(p_user uuid, p_role text)
returns void
language sql
security definer
set search_path = public
as $$
  update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
    where id = p_user;
$$;

revoke execute on function public.require_admin() from public, anon, authenticated;
revoke execute on function public.log_admin_action(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.profile_label(uuid) from public, anon, authenticated;
revoke execute on function public.sync_role_metadata(uuid, text) from public, anon, authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'new_users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_users_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'coaches', (select count(*) from public.profiles where role = 'coach'),
    'members', (select count(*) from public.profiles where role is distinct from 'coach'),
    'coach_applications', (select count(*) from public.coach_applications where status = 'pending'),
    'admins', (select count(*) from public.profiles where is_admin),
    'suspended', (select count(*) from public.profiles where is_suspended),
    'sessions', (select count(*) from public.app_sessions),
    'pending_requests', (select count(*) from public.app_session_requests where status = 'pending'),
    'announcements', (select count(*) from public.app_announcements)
  );
end;
$$;

-- The result columns changed since the first version, which create or replace can't do.
drop function if exists public.admin_list_users(text);
create function public.admin_list_users(p_search text default null)
returns table (
  id uuid,
  email text,
  full_name text,
  username text,
  role text,
  specialty text,
  coach_status text,
  is_admin boolean,
  is_suspended boolean,
  suspended_reason text,
  has_profile boolean,
  email_confirmed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pattern text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
begin
  perform public.require_admin();
  return query
    select
      u.id,
      u.email::text,
      p.full_name,
      p.username,
      coalesce(p.role, 'member'),
      p.specialty,
      a.status,
      coalesce(p.is_admin, false),
      coalesce(p.is_suspended, false),
      case when p.is_suspended then m.suspended_reason end,
      p.id is not null,
      u.email_confirmed_at is not null,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.coach_applications a on a.user_id = u.id
    left join public.account_moderation m on m.user_id = u.id
    where pattern = '%%'
      or lower(coalesce(u.email, '')) like pattern
      or lower(coalesce(p.full_name, '')) like pattern
      or lower(coalesce(p.username, '')) like pattern
    order by u.created_at desc
    limit 200;
end;
$$;

-- Pending applications first (oldest first, so nobody waits longest), then
-- recent decisions.
create or replace function public.admin_list_coach_applications()
returns table (
  user_id uuid,
  full_name text,
  username text,
  email text,
  specialty text,
  city text,
  bio text,
  status text,
  review_note text,
  reviewer_label text,
  reviewed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select
      a.user_id,
      coalesce(p.full_name, u.raw_user_meta_data ->> 'name'),
      p.username,
      u.email::text,
      coalesce(nullif(p.specialty, ''), u.raw_user_meta_data ->> 'specialty'),
      u.raw_user_meta_data ->> 'city',
      u.raw_user_meta_data ->> 'bio',
      a.status,
      a.review_note,
      public.profile_label(a.reviewed_by),
      a.reviewed_at,
      a.created_at
    from public.coach_applications a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.id = a.user_id
    where a.status = 'pending'
      or (a.reviewed_at > now() - interval '30 days' and a.reviewed_by is not null)
    order by a.status = 'pending' desc,
      case when a.status = 'pending' then a.created_at end asc,
      a.reviewed_at desc
    limit 200;
end;
$$;

create or replace function public.admin_review_coach(p_user uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  note text := nullif(trim(p_note), '');
begin
  perform public.require_admin();

  if not exists (select 1 from public.coach_applications where user_id = p_user and status = 'pending') then
    raise exception 'This application has already been reviewed.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'This account has not finished profile setup yet.';
  end if;

  update public.coach_applications
    set status = case when p_approve then 'approved' else 'rejected' end,
        review_note = note,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user;

  if p_approve then
    update public.profiles set role = 'coach', updated_at = now() where id = p_user;
    perform public.sync_role_metadata(p_user, 'coach');
  end if;

  perform public.log_admin_action(
    case when p_approve then 'approve_coach' else 'reject_coach' end,
    'user', p_user::text, public.profile_label(p_user),
    jsonb_build_object('reason', note));
end;
$$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_role text;
begin
  perform public.require_admin();
  if p_role not in ('member', 'coach') then
    raise exception 'Role must be member or coach.';
  end if;

  select role into old_role from public.profiles where id = p_user;
  if not found then
    raise exception 'This account has not finished profile setup yet.';
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_user;
  perform public.sync_role_metadata(p_user, p_role);

  -- An admin making someone a coach counts as approving them; taking it away
  -- revokes it, so they can't simply ask for it back by re-saving their profile.
  if p_role = 'coach' then
    insert into public.coach_applications (user_id, status, reviewed_by, reviewed_at)
      values (p_user, 'approved', auth.uid(), now())
    on conflict (user_id) do update
      set status = 'approved', review_note = null, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now();
  else
    update public.coach_applications
      set status = 'revoked', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
      where user_id = p_user and status in ('approved', 'pending');
  end if;

  perform public.log_admin_action('set_role', 'user', p_user::text, public.profile_label(p_user),
    jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  reason text := nullif(trim(p_reason), '');
begin
  perform public.require_admin();
  if p_user = auth.uid() then
    raise exception 'You can''t suspend your own account.';
  end if;

  select * into target from public.profiles where id = p_user;
  if not found then
    raise exception 'This account has not finished profile setup yet.';
  end if;
  if p_suspended and target.is_admin then
    raise exception 'Remove admin access before suspending this account.';
  end if;

  update public.profiles set is_suspended = p_suspended, updated_at = now() where id = p_user;

  if p_suspended then
    insert into public.account_moderation (user_id, suspended_reason, suspended_at, suspended_by)
      values (p_user, reason, now(), auth.uid())
    on conflict (user_id) do update
      set suspended_reason = excluded.suspended_reason, suspended_at = excluded.suspended_at, suspended_by = excluded.suspended_by;
  else
    delete from public.account_moderation where user_id = p_user;
  end if;

  -- Also block sign-in and end their open sessions. If this project doesn't let
  -- the database owner write to auth, the profile flag above still locks the
  -- account out of the app and the restrictive policies still block writes.
  begin
    update auth.users
      set banned_until = case when p_suspended then 'infinity'::timestamptz end
      where id = p_user;
    if p_suspended then
      delete from auth.sessions where user_id = p_user;
    end if;
  exception when insufficient_privilege then
    null;
  end;

  perform public.log_admin_action(
    case when p_suspended then 'suspend' else 'unsuspend' end,
    'user', p_user::text, public.profile_label(p_user),
    case when p_suspended then jsonb_build_object('reason', reason) else '{}'::jsonb end);
end;
$$;

create or replace function public.admin_set_admin(p_user uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  perform public.require_admin();
  if p_user = auth.uid() and not p_is_admin then
    raise exception 'You can''t remove your own admin access. Ask another admin.';
  end if;

  select * into target from public.profiles where id = p_user;
  if not found then
    raise exception 'This account has not finished profile setup yet.';
  end if;
  if p_is_admin and target.is_suspended then
    raise exception 'Restore this account before making it an admin.';
  end if;

  update public.profiles set is_admin = p_is_admin, updated_at = now() where id = p_user;

  perform public.log_admin_action(
    case when p_is_admin then 'grant_admin' else 'revoke_admin' end,
    'user', p_user::text, public.profile_label(p_user));
end;
$$;

create or replace function public.admin_list_sessions()
returns table (
  id text,
  host_id uuid,
  host_label text,
  data jsonb,
  pending_requests bigint,
  approved_requests bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select
      s.id::text,
      s.host_id,
      public.profile_label(s.host_id),
      s.data::jsonb,
      (select count(*) from public.app_session_requests r where r.session_id::text = s.id::text and r.status = 'pending'),
      (select count(*) from public.app_session_requests r where r.session_id::text = s.id::text and r.status = 'approved'),
      s.created_at
    from public.app_sessions s
    order by s.created_at desc;
end;
$$;

create or replace function public.admin_delete_session(p_session text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_title text;
begin
  perform public.require_admin();

  select coalesce(s.data ->> 'title', s.id::text) into session_title
  from public.app_sessions s where s.id::text = p_session;
  if not found then
    raise exception 'That session no longer exists.';
  end if;

  delete from public.app_session_requests where session_id::text = p_session;
  delete from public.app_sessions where id::text = p_session;

  perform public.log_admin_action('delete_session', 'session', p_session, session_title,
    jsonb_build_object('reason', nullif(trim(p_reason), '')));
end;
$$;

create or replace function public.admin_post_announcement(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.require_admin();
  insert into public.app_announcements (title, body, created_by)
    values (trim(p_title), trim(p_body), auth.uid())
    returning id into new_id;
  perform public.log_admin_action('post_announcement', 'announcement', new_id::text, trim(p_title));
  return new_id;
end;
$$;

create or replace function public.admin_delete_announcement(p_announcement uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement_title text;
begin
  perform public.require_admin();
  delete from public.app_announcements where id = p_announcement returning title into announcement_title;
  if announcement_title is null then
    raise exception 'That announcement no longer exists.';
  end if;
  perform public.log_admin_action('delete_announcement', 'announcement', p_announcement::text, announcement_title);
end;
$$;

create or replace function public.admin_list_audit_log(p_limit int default 100)
returns table (
  id bigint,
  admin_label text,
  action text,
  target_type text,
  target_label text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return query
    select l.id, public.profile_label(l.admin_id), l.action, l.target_type, l.target_label, l.details, l.created_at
    from public.admin_audit_log l
    order by l.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'admin_overview()',
    'admin_list_users(text)',
    'admin_list_coach_applications()',
    'admin_review_coach(uuid, boolean, text)',
    'admin_set_role(uuid, text)',
    'admin_set_suspended(uuid, boolean, text)',
    'admin_set_admin(uuid, boolean)',
    'admin_list_sessions()',
    'admin_delete_session(text, text)',
    'admin_post_announcement(text, text)',
    'admin_delete_announcement(uuid)',
    'admin_list_audit_log(int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

-- Make the first admin. Replace the email, then run just this statement.
-- update public.profiles set is_admin = true where lower(email) = lower('you@example.com');
