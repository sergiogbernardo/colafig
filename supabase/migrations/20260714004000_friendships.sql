-- Private friendship graph and read-only collection sharing.

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_format,
  add constraint profiles_username_format check (
    username is null
    or username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
  );

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair
  on public.friendships (
    least(requester_id::text, addressee_id::text),
    greatest(requester_id::text, addressee_id::text)
  );
create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);

alter table public.friendships enable row level security;
revoke all on table public.friendships from anon, authenticated;
grant select, delete on table public.friendships to authenticated;
grant insert (requester_id, addressee_id) on table public.friendships to authenticated;
grant update (status, updated_at) on table public.friendships to authenticated;

drop policy if exists "participants read friendships" on public.friendships;
drop policy if exists "users send friend requests" on public.friendships;
drop policy if exists "recipients accept friend requests" on public.friendships;
drop policy if exists "participants remove friendships" on public.friendships;

create policy "participants read friendships"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "users send friend requests"
  on public.friendships for insert
  to authenticated
  with check (
    (select auth.uid()) = requester_id
    and requester_id <> addressee_id
    and status = 'pending'
  );

create policy "recipients accept friend requests"
  on public.friendships for update
  to authenticated
  using ((select auth.uid()) = addressee_id and status = 'pending')
  with check ((select auth.uid()) = addressee_id and status = 'accepted');

create policy "participants remove friendships"
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Profiles expose only the deliberately public username/display name columns.
drop policy if exists "authenticated users discover profiles" on public.profiles;
create policy "authenticated users discover profiles"
  on public.profiles for select
  to authenticated
  using (username is not null);

-- Accepted friends may inspect libraries and quantities, never modify them.
drop policy if exists "friends read shared album libraries" on public.user_albums;
create policy "friends read shared album libraries"
  on public.user_albums for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships
      where friendships.status = 'accepted'
        and (
          (friendships.requester_id = (select auth.uid()) and friendships.addressee_id = user_albums.user_id)
          or (friendships.addressee_id = (select auth.uid()) and friendships.requester_id = user_albums.user_id)
        )
    )
  );

drop policy if exists "friends read shared collections" on public.collections;
create policy "friends read shared collections"
  on public.collections for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships
      where friendships.status = 'accepted'
        and (
          (friendships.requester_id = (select auth.uid()) and friendships.addressee_id = collections.user_id)
          or (friendships.addressee_id = (select auth.uid()) and friendships.requester_id = collections.user_id)
        )
    )
  );
