-- ColaFig initial schema. Apply with the Supabase CLI after reviewing it.
-- Every table exposed through the Data API has RLS enabled and explicit grants.

create extension if not exists pgcrypto;

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 120),
  year smallint check (year between 1900 and 2200),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  slug text not null,
  name text not null check (char_length(name) between 1 and 120),
  position integer not null check (position >= 0),
  unique (album_id, slug),
  unique (album_id, position)
);

create table public.stickers (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  code text not null,
  label text not null check (char_length(label) between 1 and 160),
  position integer not null check (position >= 0),
  unique (album_id, code),
  unique (section_id, position)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  sticker_id uuid not null references public.stickers(id) on delete cascade,
  quantity smallint not null default 0 check (quantity between 0 and 99),
  updated_at timestamptz not null default now(),
  primary key (user_id, sticker_id)
);

create index collections_user_id_idx on public.collections(user_id);
create index stickers_album_section_idx on public.stickers(album_id, section_id);

alter table public.albums enable row level security;
alter table public.sections enable row level security;
alter table public.stickers enable row level security;
alter table public.profiles enable row level security;
alter table public.collections enable row level security;

revoke all on table public.albums from anon, authenticated;
revoke all on table public.sections from anon, authenticated;
revoke all on table public.stickers from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.collections from anon, authenticated;

-- The catalogue is public read-only. It is populated through reviewed migrations.
grant select on table public.albums, public.sections, public.stickers to anon, authenticated;

create policy "catalogue albums are readable"
  on public.albums for select
  to anon, authenticated
  using (true);

create policy "catalogue sections are readable"
  on public.sections for select
  to anon, authenticated
  using (true);

create policy "catalogue stickers are readable"
  on public.stickers for select
  to anon, authenticated
  using (true);

grant select, insert, update on table public.profiles to authenticated;

create policy "users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "users create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update, delete on table public.collections to authenticated;

create policy "users read their own collection"
  on public.collections for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users add to their own collection"
  on public.collections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update their own collection"
  on public.collections for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users remove from their own collection"
  on public.collections for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Create an empty private profile after signup. No user metadata is trusted here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
