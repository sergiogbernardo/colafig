-- Multi-album catalogue and private user libraries.
-- Catalogue writes remain unavailable to browser roles.

alter table public.albums
  add column if not exists category text,
  add column if not exists publisher text,
  add column if not exists edition text,
  add column if not exists description text,
  add column if not exists accent_color text;

alter table public.albums
  drop constraint if exists albums_category_length,
  drop constraint if exists albums_publisher_length,
  drop constraint if exists albums_edition_length,
  drop constraint if exists albums_description_length,
  drop constraint if exists albums_accent_color_format,
  add constraint albums_category_length check (category is null or char_length(category) between 1 and 60),
  add constraint albums_publisher_length check (publisher is null or char_length(publisher) between 1 and 100),
  add constraint albums_edition_length check (edition is null or char_length(edition) between 1 and 100),
  add constraint albums_description_length check (description is null or char_length(description) between 1 and 500),
  add constraint albums_accent_color_format check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');

create table if not exists public.user_albums (
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  last_section_id uuid references public.sections(id) on delete set null,
  is_favorite boolean not null default false,
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, album_id),
  check (completed_at is null or completed_at >= added_at)
);

create index if not exists user_albums_user_id_idx on public.user_albums(user_id);
alter table public.user_albums enable row level security;
revoke all on table public.user_albums from anon, authenticated;
grant select, insert, update, delete on table public.user_albums to authenticated;

drop policy if exists "users read their own album library" on public.user_albums;
drop policy if exists "users add published albums to their own library" on public.user_albums;
drop policy if exists "users update their own album library" on public.user_albums;
drop policy if exists "users remove albums from their own library" on public.user_albums;
drop policy if exists "users remove albums from their own album library" on public.user_albums;

create policy "users read their own album library"
  on public.user_albums for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users add published albums to their own library"
  on public.user_albums for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.albums
      where albums.id = user_albums.album_id
        and albums.is_active = true
    )
    and (
      last_section_id is null
      or exists (
        select 1 from public.sections
        where sections.id = user_albums.last_section_id
          and sections.album_id = user_albums.album_id
      )
    )
  );

create policy "users update their own album library"
  on public.user_albums for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.albums
      where albums.id = user_albums.album_id
        and albums.is_active = true
    )
    and (
      last_section_id is null
      or exists (
        select 1 from public.sections
        where sections.id = user_albums.last_section_id
          and sections.album_id = user_albums.album_id
      )
    )
  );

create policy "users remove albums from their own library"
  on public.user_albums for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Only fully published catalogue entries are exposed through the Data API.
drop policy if exists "catalogue albums are readable" on public.albums;
drop policy if exists "catalogue sections are readable" on public.sections;
drop policy if exists "catalogue stickers are readable" on public.stickers;
drop policy if exists "published catalogue albums are readable" on public.albums;
drop policy if exists "published catalogue sections are readable" on public.sections;
drop policy if exists "published catalogue stickers are readable" on public.stickers;

create policy "published catalogue albums are readable"
  on public.albums for select
  to anon, authenticated
  using (is_active = true);

create policy "published catalogue sections are readable"
  on public.sections for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.albums
      where albums.id = sections.album_id
        and albums.is_active = true
    )
  );

create policy "published catalogue stickers are readable"
  on public.stickers for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.albums
      where albums.id = stickers.album_id
        and albums.is_active = true
    )
  );
