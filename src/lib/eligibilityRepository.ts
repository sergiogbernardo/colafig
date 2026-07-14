import { supabase } from './supabase';

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export async function loadAdultEligibility(userId: string) {
  const { data, error } = await requireClient()
    .from('profiles')
    .select('adult_confirmed_at, age_gate_version')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return {
    confirmed: Boolean(data.adult_confirmed_at),
    version: data.age_gate_version as string | null,
  };
}

export async function confirmAdultEligibility(birthDate: string) {
  const { data, error } = await requireClient().rpc('confirm_adult_eligibility', {
    supplied_birth_date: birthDate,
  });
  if (error) throw error;
  return data === true;
}
