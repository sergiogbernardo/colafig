import type { CollectionListItem, CollectionListView } from './collectionList';
import { supabase } from './supabase';

export type PublicCollectionShare = {
  albumName: string;
  albumSlug: string;
  items: CollectionListItem[];
  ownerName: string;
  viewType: CollectionListView;
};

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export async function createCollectionShare(albumSlug: string, view: CollectionListView) {
  const { data, error } = await requireClient().rpc('create_collection_share', { album_slug: albumSlug, share_view: view });
  if (error) throw error;
  return String(data);
}

export async function revokeCollectionShare(albumSlug: string, view: CollectionListView) {
  const { error } = await requireClient().rpc('revoke_collection_share', { album_slug: albumSlug, share_view: view });
  if (error) throw error;
}

export async function loadPublicCollectionShare(token: string): Promise<PublicCollectionShare | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const { data, error } = await requireClient().rpc('get_collection_share', { share_token: token });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as unknown as PublicCollectionShare;
  if (!['missing', 'duplicates'].includes(value.viewType) || !Array.isArray(value.items)) return null;
  return value;
}
