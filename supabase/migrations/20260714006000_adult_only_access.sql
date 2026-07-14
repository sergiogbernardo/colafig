-- Interim adult-only access gate. Birth dates are validated in transit and are not persisted.

alter table public.profiles
  add column if not exists adult_confirmed_at timestamptz,
  add column if not exists age_gate_version text;

create or replace function public.is_adult_confirmed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.adult_confirmed_at is not null
  );
$$;

revoke all on function public.is_adult_confirmed() from public, anon;
grant execute on function public.is_adult_confirmed() to authenticated;

create or replace function public.prepare_adult_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  birth_date_text text;
  supplied_birth_date date;
begin
  birth_date_text := coalesce(new.raw_user_meta_data, '{}'::jsonb) ->> 'birth_date';
  -- Never trust eligibility flags supplied by the browser. Only this trigger may
  -- add them after validating the transient birth date.
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
    - 'adult_confirmed'
    - 'adult_confirmed_at'
    - 'age_gate_version'
    - 'birth_date';
  if birth_date_text is null or birth_date_text = '' then
    return new;
  end if;

  begin
    supplied_birth_date := birth_date_text::date;
  exception when others then
    raise exception 'invalid birth date' using errcode = '22007';
  end;

  if supplied_birth_date > current_date - interval '18 years' then
    raise exception 'ColaFig is available only to people aged 18 or older' using errcode = 'P0001';
  end if;
  if supplied_birth_date < current_date - interval '120 years' then
    raise exception 'invalid birth date' using errcode = '22007';
  end if;

  new.raw_user_meta_data := new.raw_user_meta_data || jsonb_build_object(
      'adult_confirmed', true,
      'adult_confirmed_at', now(),
      'age_gate_version', 'adult-only-v1'
    );
  return new;
end;
$$;

revoke all on function public.prepare_adult_signup() from public, anon, authenticated;

drop trigger if exists before_auth_user_adult_gate on auth.users;
create trigger before_auth_user_adult_gate
  before insert on auth.users
  for each row execute procedure public.prepare_adult_signup();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_confirmed boolean := coalesce(new.raw_user_meta_data ->> 'adult_confirmed', 'false') = 'true';
begin
  insert into public.profiles (id, adult_confirmed_at, age_gate_version)
  values (
    new.id,
    case when is_confirmed then now() else null end,
    case when is_confirmed then coalesce(new.raw_user_meta_data ->> 'age_gate_version', 'adult-only-v1') else null end
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.confirm_adult_eligibility(supplied_birth_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if supplied_birth_date is null
    or supplied_birth_date > current_date - interval '18 years'
    or supplied_birth_date < current_date - interval '120 years' then
    raise exception 'adult eligibility not confirmed' using errcode = 'P0001';
  end if;

  update public.profiles
  set adult_confirmed_at = now(),
      age_gate_version = 'adult-only-v1',
      updated_at = now()
  where id = caller_id;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.confirm_adult_eligibility(date) from public, anon;
grant execute on function public.confirm_adult_eligibility(date) to authenticated;

-- Eligibility fields can only be changed through the reviewed RPC above.
revoke insert, update on table public.profiles from authenticated;
grant update (display_name, username, updated_at) on table public.profiles to authenticated;

drop policy if exists "adult accounts read profiles" on public.profiles;
drop policy if exists "adult accounts update profiles" on public.profiles;
create policy "adult accounts read profiles"
  on public.profiles as restrictive for select
  to authenticated
  using ((select auth.uid()) = id or (select public.is_adult_confirmed()));
create policy "adult accounts update profiles"
  on public.profiles as restrictive for update
  to authenticated
  using ((select public.is_adult_confirmed()))
  with check ((select public.is_adult_confirmed()));

drop policy if exists "adult accounts use collections" on public.collections;
create policy "adult accounts use collections"
  on public.collections as restrictive for all
  to authenticated
  using (
    (select public.is_adult_confirmed())
    and exists (
      select 1 from public.profiles
      where profiles.id = collections.user_id
        and profiles.adult_confirmed_at is not null
    )
  )
  with check (
    (select public.is_adult_confirmed())
    and exists (
      select 1 from public.profiles
      where profiles.id = collections.user_id
        and profiles.adult_confirmed_at is not null
    )
  );

drop policy if exists "adult accounts use album libraries" on public.user_albums;
create policy "adult accounts use album libraries"
  on public.user_albums as restrictive for all
  to authenticated
  using (
    (select public.is_adult_confirmed())
    and exists (
      select 1 from public.profiles
      where profiles.id = user_albums.user_id
        and profiles.adult_confirmed_at is not null
    )
  )
  with check (
    (select public.is_adult_confirmed())
    and exists (
      select 1 from public.profiles
      where profiles.id = user_albums.user_id
        and profiles.adult_confirmed_at is not null
    )
  );

drop policy if exists "adult accounts use friendships" on public.friendships;
create policy "adult accounts use friendships"
  on public.friendships as restrictive for all
  to authenticated
  using ((select public.is_adult_confirmed()))
  with check ((select public.is_adult_confirmed()));

create or replace function public.search_profiles(search_query text)
returns table (id uuid, username text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_query text;
  current_count integer;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_adult_confirmed() then
    raise exception 'adult eligibility required' using errcode = '42501';
  end if;

  normalized_query := regexp_replace(lower(trim(leading '@' from trim(search_query))), '[^a-z0-9_-]', '', 'g');
  if char_length(normalized_query) < 3 then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-search:' || caller_id::text, 0));
  insert into public.profile_search_rate_limits (user_id, window_started_at, request_count)
  values (caller_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case when public.profile_search_rate_limits.window_started_at < now() - interval '10 minutes' then now() else public.profile_search_rate_limits.window_started_at end,
      request_count = case when public.profile_search_rate_limits.window_started_at < now() - interval '10 minutes' then 1 else public.profile_search_rate_limits.request_count + 1 end
  returning request_count into current_count;

  if current_count > 30 then
    raise exception 'profile search rate limit exceeded' using errcode = 'P0001';
  end if;

  return query
  select profile.id, profile.username, profile.display_name
  from public.profiles as profile
  where profile.id <> caller_id
    and profile.adult_confirmed_at is not null
    and profile.username is not null
    and profile.username ilike '%' || normalized_query || '%'
  order by case when profile.username like normalized_query || '%' then 0 else 1 end, profile.username
  limit 12;
end;
$$;

create or replace function public.send_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  friendship_id uuid;
begin
  if caller_id is null or not public.is_adult_confirmed() then
    raise exception 'adult eligibility required' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = caller_id then
    raise exception 'invalid friend request target' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where profiles.id = target_user_id
      and profiles.adult_confirmed_at is not null
  ) then
    raise exception 'target profile is unavailable' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('friend-request:' || caller_id::text, 0));
  if (select count(*) from public.friend_request_events where requester_id = caller_id and created_at >= now() - interval '24 hours') >= 20 then
    raise exception 'daily friend request limit exceeded' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.friend_request_events where requester_id = caller_id and addressee_id = target_user_id and created_at >= now() - interval '10 minutes') then
    raise exception 'friend request cooldown active' using errcode = 'P0001';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (caller_id, target_user_id)
  returning id into friendship_id;
  insert into public.friend_request_events (requester_id, addressee_id)
  values (caller_id, target_user_id);
  return friendship_id;
end;
$$;

revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
