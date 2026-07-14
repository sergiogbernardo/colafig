-- Bound profile discovery and friend-request abuse at the database boundary.

drop policy if exists "authenticated users discover profiles" on public.profiles;

create policy "users read connected profiles"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    or exists (
      select 1
      from public.friendships
      where (select auth.uid()) in (friendships.requester_id, friendships.addressee_id)
        and profiles.id in (friendships.requester_id, friendships.addressee_id)
    )
  );

create table if not exists public.profile_search_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

create table if not exists public.friend_request_events (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create index if not exists friend_request_events_requester_created_idx
  on public.friend_request_events (requester_id, created_at desc);
create index if not exists friend_request_events_pair_created_idx
  on public.friend_request_events (requester_id, addressee_id, created_at desc);

alter table public.profile_search_rate_limits enable row level security;
alter table public.friend_request_events enable row level security;
revoke all on table public.profile_search_rate_limits from public, anon, authenticated;
revoke all on table public.friend_request_events from public, anon, authenticated;

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

  normalized_query := regexp_replace(lower(trim(leading '@' from trim(search_query))), '[^a-z0-9_-]', '', 'g');
  if char_length(normalized_query) < 3 then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-search:' || caller_id::text, 0));

  insert into public.profile_search_rate_limits (user_id, window_started_at, request_count)
  values (caller_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when public.profile_search_rate_limits.window_started_at < now() - interval '10 minutes' then now()
        else public.profile_search_rate_limits.window_started_at
      end,
      request_count = case
        when public.profile_search_rate_limits.window_started_at < now() - interval '10 minutes' then 1
        else public.profile_search_rate_limits.request_count + 1
      end
  returning request_count into current_count;

  if current_count > 30 then
    raise exception 'profile search rate limit exceeded' using errcode = 'P0001';
  end if;

  return query
  select profile.id, profile.username, profile.display_name
  from public.profiles as profile
  where profile.id <> caller_id
    and profile.username is not null
    and profile.username ilike '%' || normalized_query || '%'
  order by
    case when profile.username like normalized_query || '%' then 0 else 1 end,
    profile.username
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
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = caller_id then
    raise exception 'invalid friend request target' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('friend-request:' || caller_id::text, 0));

  if (
    select count(*)
    from public.friend_request_events
    where requester_id = caller_id
      and created_at >= now() - interval '24 hours'
  ) >= 20 then
    raise exception 'daily friend request limit exceeded' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.friend_request_events
    where requester_id = caller_id
      and addressee_id = target_user_id
      and created_at >= now() - interval '10 minutes'
  ) then
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

revoke insert on table public.friendships from authenticated;
revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
