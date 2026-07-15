-- Revocable, unguessable public links for a single missing/duplicates list.

create table public.collection_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  view_type text not null check (view_type in ('missing', 'duplicates')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, album_id, view_type)
);

create index collection_shares_token_active_idx
  on public.collection_shares (token)
  where revoked_at is null;

alter table public.collection_shares enable row level security;
revoke all on table public.collection_shares from public, anon, authenticated;

create or replace function public.create_collection_share(album_slug text, share_view text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  selected_album_id uuid;
  share_token uuid;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if share_view not in ('missing', 'duplicates') then
    raise exception 'invalid share view' using errcode = '22023';
  end if;

  select albums.id into selected_album_id
  from public.albums
  where albums.slug = album_slug and albums.is_active = true;

  if selected_album_id is null or not exists (
    select 1 from public.user_albums
    where user_albums.user_id = caller_id
      and user_albums.album_id = selected_album_id
  ) then
    raise exception 'album is unavailable' using errcode = 'P0002';
  end if;

  insert into public.collection_shares (user_id, album_id, view_type)
  values (caller_id, selected_album_id, share_view)
  on conflict (user_id, album_id, view_type) do update
  set token = case
        when public.collection_shares.revoked_at is null then public.collection_shares.token
        else gen_random_uuid()
      end,
      revoked_at = null,
      updated_at = now()
  returning token into share_token;

  return share_token;
end;
$$;

create or replace function public.revoke_collection_share(album_slug text, share_view text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.collection_shares
  set revoked_at = now(), updated_at = now()
  where collection_shares.user_id = auth.uid()
    and collection_shares.view_type = share_view
    and collection_shares.album_id = (
      select albums.id from public.albums where albums.slug = album_slug
    )
    and collection_shares.revoked_at is null;

  return found;
end;
$$;

create or replace function public.get_collection_share(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ownerName', coalesce(nullif(profiles.display_name, ''), nullif(profiles.username, ''), 'Colecionador ColaFig'),
    'albumSlug', albums.slug,
    'albumName', albums.name,
    'viewType', collection_shares.view_type,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', shared_items.code,
          'label', shared_items.label,
          'sectionName', shared_items.section_name,
          'quantity', shared_items.quantity
        ) order by shared_items.section_position, shared_items.sticker_position
      ) filter (where shared_items.code is not null),
      '[]'::jsonb
    )
  )
  from public.collection_shares
  join public.albums on albums.id = collection_shares.album_id and albums.is_active = true
  left join public.profiles on profiles.id = collection_shares.user_id
  left join lateral (
    select
      stickers.code,
      stickers.label,
      sections.name as section_name,
      sections.position as section_position,
      stickers.position as sticker_position,
      coalesce(collections.quantity, 0)::smallint as quantity
    from public.stickers
    join public.sections on sections.id = stickers.section_id
    left join public.collections
      on collections.user_id = collection_shares.user_id
      and collections.sticker_id = stickers.id
    where stickers.album_id = albums.id
      and (
        (collection_shares.view_type = 'missing' and coalesce(collections.quantity, 0) = 0)
        or (collection_shares.view_type = 'duplicates' and coalesce(collections.quantity, 0) > 1)
      )
  ) as shared_items on true
  where collection_shares.token = share_token
    and collection_shares.revoked_at is null
  group by collection_shares.id, profiles.display_name, profiles.username, albums.id;
$$;

revoke all on function public.create_collection_share(text, text) from public, anon;
revoke all on function public.revoke_collection_share(text, text) from public, anon;
revoke all on function public.get_collection_share(uuid) from public;
grant execute on function public.create_collection_share(text, text) to authenticated;
grant execute on function public.revoke_collection_share(text, text) to authenticated;
grant execute on function public.get_collection_share(uuid) to anon, authenticated;
