// Todos los backends exponen la misma interfaz:
//   getState()
//   voteDinnerDay(profileId, day | null)
//   voteRestaurant(profileId, restaurantId | null)
//   setAvailability(profileId, date, slot, available)
//   rateActivity(profileId, activityId, score | null)
//   addOption(kind, name) · renameOption(kind, id, name) · deleteOption(kind, id)
//   addPlace({ place_id, name, address, lat, lng, maps_url })
//   setDinner(profileId, date, time, restaurantId) · setPlanEvent(profileId, date, slot, activityId)
//   deleteEvent(id) · setAttendance(profileId, eventId, going | null)
//   subscribe(onChange, onStatus) → unsubscribe

export async function createBackend({ supabaseUrl, supabaseAnonKey }, { demo = false } = {}) {
  if (supabaseUrl && supabaseAnonKey && !demo) {
    const { createSupabaseBackend } = await import('./supabaseBackend.js');
    return createSupabaseBackend(supabaseUrl, supabaseAnonKey);
  }
  const { createDemoBackend } = await import('./demoBackend.js');
  return createDemoBackend();
}
