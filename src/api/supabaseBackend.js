import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

const REALTIME_TABLES = ['restaurants', 'activities', 'dinner_day_votes', 'restaurant_votes', 'availability', 'activity_ratings'];

function friendlyError(error) {
  const msg = error?.message ?? '';
  if (/fetch|network|Failed to/i.test(msg)) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
  return msg || 'Algo ha fallado. Inténtalo de nuevo.';
}

export function createSupabaseBackend(url, anonKey) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });

  async function rpc(fn, args) {
    let result;
    try {
      result = await client.rpc(fn, args);
    } catch (e) {
      throw new Error(friendlyError(e));
    }
    if (result.error) throw new Error(friendlyError(result.error));
    return result.data;
  }

  return {
    mode: 'supabase',
    getState: () => rpc('get_state'),
    voteDinnerDay: (profileId, day) => rpc('vote_dinner_day', { p_profile: profileId, p_day: day }),
    voteRestaurant: (profileId, restaurantId) =>
      rpc('vote_restaurant', { p_profile: profileId, p_restaurant: restaurantId }),
    setAvailability: (profileId, date, slot, available) =>
      rpc('set_availability', { p_profile: profileId, p_date: date, p_slot: slot, p_available: available }),
    rateActivity: (profileId, activityId, score) =>
      rpc('rate_activity', { p_profile: profileId, p_activity: activityId, p_score: score }),
    addOption: (kind, name) => rpc('add_option', { p_kind: kind, p_name: name }),
    renameOption: (kind, id, name) => rpc('rename_option', { p_kind: kind, p_id: id, p_name: name }),
    deleteOption: (kind, id) => rpc('delete_option', { p_kind: kind, p_id: id }),

    subscribe(onChange, onStatus) {
      let channel = client.channel('patagenda');
      for (const table of REALTIME_TABLES) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') onStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('offline');
      });
      return () => client.removeChannel(channel);
    },
  };
}
