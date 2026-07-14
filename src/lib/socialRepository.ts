import { supabase } from './supabase';

export type PublicProfile = {
  displayName: string | null;
  id: string;
  username: string;
};

export type Friendship = {
  addresseeId: string;
  createdAt: string;
  id: string;
  requesterId: string;
  status: 'accepted' | 'pending';
};

export type SocialState = {
  friends: Array<{ friendshipId: string; profile: PublicProfile }>;
  incoming: Array<{ friendshipId: string; profile: PublicProfile }>;
  outgoing: Array<{ friendshipId: string; profile: PublicProfile }>;
  profile: PublicProfile | null;
};

type ProfileRow = { display_name: string | null; id: string; username: string | null };
type FriendshipRow = { addressee_id: string; created_at: string; id: string; requester_id: string; status: 'accepted' | 'pending' };

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

function mapProfile(row: ProfileRow): PublicProfile | null {
  if (!row.username) return null;
  return { displayName: row.display_name, id: row.id, username: row.username };
}

export async function loadSocialState(userId: string): Promise<SocialState> {
  const client = requireClient();
  const [profileResult, friendshipResult] = await Promise.all([
    client.from('profiles').select('id, username, display_name').eq('id', userId).maybeSingle(),
    client.from('friendships').select('id, requester_id, addressee_id, status, created_at').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (friendshipResult.error) throw friendshipResult.error;

  const rows = (friendshipResult.data ?? []) as FriendshipRow[];
  const profileIds = [...new Set(rows.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id))];
  let profiles: PublicProfile[] = [];
  if (profileIds.length > 0) {
    const { data, error } = await client.from('profiles').select('id, username, display_name').in('id', profileIds);
    if (error) throw error;
    profiles = ((data ?? []) as ProfileRow[]).map(mapProfile).filter((profile): profile is PublicProfile => Boolean(profile));
  }
  const profilesById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  const friends: SocialState['friends'] = [];
  const incoming: SocialState['incoming'] = [];
  const outgoing: SocialState['outgoing'] = [];

  rows.forEach((row) => {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const profile = profilesById[otherId];
    if (!profile) return;
    if (row.status === 'accepted') friends.push({ friendshipId: row.id, profile });
    else if (row.addressee_id === userId) incoming.push({ friendshipId: row.id, profile });
    else outgoing.push({ friendshipId: row.id, profile });
  });

  return {
    friends,
    incoming,
    outgoing,
    profile: profileResult.data ? mapProfile(profileResult.data as ProfileRow) : null,
  };
}

export async function saveProfile(userId: string, username: string, displayName: string) {
  const normalizedUsername = username.toLowerCase().trim();
  const { data, error } = await requireClient().from('profiles').update({
    display_name: displayName.trim() || null,
    updated_at: new Date().toISOString(),
    username: normalizedUsername,
  }).eq('id', userId).select('id, username, display_name').single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

export async function searchProfiles(query: string) {
  const normalized = query.toLowerCase().trim().replace(/^@/, '').replace(/[^a-z0-9_-]/g, '');
  if (normalized.length < 3) return [];
  const { data, error } = await requireClient().rpc('search_profiles', { search_query: normalized });
  if (error) throw error;
  return ((data ?? []) as ProfileRow[]).map(mapProfile).filter((profile): profile is PublicProfile => Boolean(profile));
}

export async function sendFriendRequest(addresseeId: string) {
  const { error } = await requireClient().rpc('send_friend_request', { target_user_id: addresseeId });
  if (error) throw error;
}

export async function acceptFriendRequest(friendshipId: string) {
  const { error } = await requireClient().from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId);
  if (error) throw error;
}

export async function removeFriendship(friendshipId: string) {
  const { error } = await requireClient().from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}
