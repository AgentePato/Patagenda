import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

const REALTIME_TABLES = ['profiles', 'restaurants', 'activities', 'dinner_day_votes', 'restaurant_votes',
  'availability', 'activity_ratings', 'events', 'event_attendance'];

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
    voteDinnerDay: (profileId, day, on) => rpc('vote_dinner_day', { p_profile: profileId, p_day: day, p_on: on }),
    voteRestaurant: (profileId, restaurantId) =>
      rpc('vote_restaurant', { p_profile: profileId, p_restaurant: restaurantId }),
    setAvailability: (profileId, date, slot, available) =>
      rpc('set_availability', { p_profile: profileId, p_date: date, p_slot: slot, p_available: available }),
    rateActivity: (profileId, activityId, score) =>
      rpc('rate_activity', { p_profile: profileId, p_activity: activityId, p_score: score }),
    addOption: (kind, name) => rpc('add_option', { p_kind: kind, p_name: name }),
    renameOption: (kind, id, name) => rpc('rename_option', { p_kind: kind, p_id: id, p_name: name }),
    deleteOption: (kind, id) => rpc('delete_option', { p_kind: kind, p_id: id }),
    addPlace: (place) => rpc('add_place', {
      p_name: place.name, p_address: place.address, p_lat: place.lat, p_lng: place.lng,
      p_place_id: place.place_id, p_maps_url: place.maps_url,
    }),
    setDinner: (profileId, date, time, restaurantId) =>
      rpc('set_dinner', { p_profile: profileId, p_date: date, p_time: time, p_restaurant: restaurantId }),
    setPlanEvent: (profileId, date, slot, activityId) =>
      rpc('set_plan_event', { p_profile: profileId, p_date: date, p_slot: slot, p_activity: activityId }),
    deleteEvent: (id) => rpc('delete_event', { p_id: id }),
    setAttendance: (profileId, eventId, going) =>
      rpc('set_attendance', { p_profile: profileId, p_event: eventId, p_going: going }),

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
