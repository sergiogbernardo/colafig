import { supabase } from './supabase';

type CatalogueAlbumRow = { id: string; slug: string };
type CatalogueStickerRow = { album_id: string; code: string; id: string };
type CollectionRow = { quantity: number; sticker_id: string };
type UserAlbumRow = { album_id: string };

const PAGE_SIZE = 1000;

export type RemoteCollectionState = {
  albumIdsBySlug: Record<string, string>;
  quantitiesByKey: Record<string, number>;
  stickerIdsByKey: Record<string, string>;
  userAlbums: string[];
};

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

async function loadStickerRows() {
  const client = requireClient();
  const rows: CatalogueStickerRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('stickers')
      .select('id, album_id, code')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as CatalogueStickerRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadCollectionRows(userId: string) {
  const client = requireClient();
  const rows: CollectionRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('collections')
      .select('sticker_id, quantity')
      .eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as CollectionRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadRemoteCollection(userId: string): Promise<RemoteCollectionState> {
  const client = requireClient();
  const [albumsResult, remoteStickers, libraryResult, collection] = await Promise.all([
    client.from('albums').select('id, slug').eq('is_active', true),
    loadStickerRows(),
    client.from('user_albums').select('album_id').eq('user_id', userId),
    loadCollectionRows(userId),
  ]);

  const error = albumsResult.error ?? libraryResult.error;
  if (error) throw error;

  const albums = (albumsResult.data ?? []) as CatalogueAlbumRow[];
  const library = (libraryResult.data ?? []) as UserAlbumRow[];
  const albumIdsBySlug = Object.fromEntries(albums.map((album) => [album.slug, album.id]));
  const slugsByAlbumId = Object.fromEntries(albums.map((album) => [album.id, album.slug]));
  const publishedStickers = remoteStickers.filter((sticker) => Boolean(slugsByAlbumId[sticker.album_id]));
  const stickerKeysById = Object.fromEntries(publishedStickers.map((sticker) => [sticker.id, `${slugsByAlbumId[sticker.album_id]}:${sticker.code}`]));
  const stickerIdsByKey = Object.fromEntries(publishedStickers.map((sticker) => [`${slugsByAlbumId[sticker.album_id]}:${sticker.code}`, sticker.id]));
  const quantitiesByKey = Object.fromEntries(
    collection
      .map((item) => [stickerKeysById[item.sticker_id], item.quantity] as const)
      .filter(([key]) => Boolean(key)),
  );

  return {
    albumIdsBySlug,
    quantitiesByKey,
    stickerIdsByKey,
    userAlbums: library.map((item) => slugsByAlbumId[item.album_id]).filter(Boolean),
  };
}

export async function saveUserAlbum(userId: string, albumId: string) {
  const { error } = await requireClient().from('user_albums').upsert(
    { album_id: albumId, user_id: userId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,album_id' },
  );
  if (error) throw error;
}

export async function saveStickerQuantity(userId: string, stickerId: string, quantity: number) {
  const client = requireClient();
  if (quantity === 0) {
    const { error } = await client.from('collections').delete().eq('user_id', userId).eq('sticker_id', stickerId);
    if (error) throw error;
    return;
  }

  const { error } = await client.from('collections').upsert(
    { quantity, sticker_id: stickerId, updated_at: new Date().toISOString(), user_id: userId },
    { onConflict: 'user_id,sticker_id' },
  );
  if (error) throw error;
}

export async function migrateCollection(
  userId: string,
  albums: Array<{ albumId: string }>,
  quantities: Array<{ quantity: number; stickerId: string }>,
) {
  const client = requireClient();
  if (albums.length > 0) {
    const { error } = await client.from('user_albums').upsert(
      albums.map(({ albumId }) => ({ album_id: albumId, user_id: userId, updated_at: new Date().toISOString() })),
      { onConflict: 'user_id,album_id' },
    );
    if (error) throw error;
  }

  const positiveQuantities = quantities.filter(({ quantity }) => quantity > 0);
  if (positiveQuantities.length > 0) {
    const { error } = await client.from('collections').upsert(
      positiveQuantities.map(({ quantity, stickerId }) => ({ quantity, sticker_id: stickerId, updated_at: new Date().toISOString(), user_id: userId })),
      { onConflict: 'user_id,sticker_id' },
    );
    if (error) throw error;
  }
}
