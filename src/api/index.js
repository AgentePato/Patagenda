// Todos los backends exponen la misma interfaz:
//   getState()
//   voteDinnerDay(profileId, day | null)
//   voteRestaurant(profileId, restaurantId | null)
//   setAvailability(profileId, date, slot, available)
//   rateActivity(profileId, activityId, score | null)
//   addOption(kind, name) · renameOption(kind, id, name) · deleteOption(kind, id)
//   subscribe(onChange, onStatus) → unsubscribe

export async function createBackend({ supabaseUrl, supabaseAnonKey }) {
  if (supabaseUrl && supabaseAnonKey) {
    const { createSupabaseBackend } = await import('./supabaseBackend.js');
    return createSupabaseBackend(supabaseUrl, supabaseAnonKey);
  }
  const { createDemoBackend } = await import('./demoBackend.js');
  return createDemoBackend();
}
