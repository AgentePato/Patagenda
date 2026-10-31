// Estado compartido de la app. Cada acción se aplica al momento en pantalla
// (optimista), se envía al backend y después se vuelve a leer el estado
// real del servidor, que es siempre la fuente de verdad.

const EMPTY = {
  profiles: [], restaurants: [], activities: [],
  dinner_day_votes: [], restaurant_votes: [], availability: [], activity_ratings: [],
};

const normalize = (data) => ({ ...EMPTY, ...data });

export function createStore(backend) {
  let state = null;
  let pending = 0;      // mutaciones en curso
  let fetchSeq = 0;     // descarta respuestas de lecturas viejas
  let refreshTimer = null;
  const listeners = new Set();

  const emit = () => listeners.forEach((l) => l(state));

  async function refresh() {
    const seq = ++fetchSeq;
    const data = await backend.getState();
    // Si mientras tanto hubo otra lectura o una mutación, esta respuesta puede estar desfasada.
    if (seq !== fetchSeq || pending > 0) return;
    state = normalize(data);
    emit();
  }

  function scheduleRefresh(delay = 120) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh().catch(() => {}), delay);
  }

  async function mutate(optimistic, call) {
    pending += 1;
    fetchSeq += 1;
    if (optimistic && state) {
      const draft = structuredClone(state);
      optimistic(draft);
      state = draft;
      emit();
    }
    try {
      return await call();
    } finally {
      pending -= 1;
      if (pending === 0) scheduleRefresh(0);
    }
  }

  // Sustituye la fila de `match` por `row` (o la quita si row es null).
  const replace = (rows, match, row) => [...rows.filter((r) => !match(r)), ...(row ? [row] : [])];

  return {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh,
    scheduleRefresh,

    voteDinnerDay: (profileId, day) => mutate(
      (s) => { s.dinner_day_votes = replace(s.dinner_day_votes, (v) => v.profile_id === profileId, day && { profile_id: profileId, day }); },
      () => backend.voteDinnerDay(profileId, day),
    ),

    voteRestaurant: (profileId, restaurantId) => mutate(
      (s) => {
        s.restaurant_votes = replace(s.restaurant_votes, (v) => v.profile_id === profileId,
          restaurantId && { profile_id: profileId, restaurant_id: restaurantId });
      },
      () => backend.voteRestaurant(profileId, restaurantId),
    ),

    setAvailability: (profileId, date, slot, available) => mutate(
      (s) => {
        s.availability = replace(s.availability,
          (v) => v.profile_id === profileId && v.slot_date === date && v.slot === slot,
          available && { profile_id: profileId, slot_date: date, slot });
      },
      () => backend.setAvailability(profileId, date, slot, available),
    ),

    rateActivity: (profileId, activityId, score) => mutate(
      (s) => {
        s.activity_ratings = replace(s.activity_ratings,
          (v) => v.profile_id === profileId && v.activity_id === activityId,
          score && { profile_id: profileId, activity_id: activityId, score });
      },
      () => backend.rateActivity(profileId, activityId, score),
    ),

    addOption: (kind, name) => mutate(null, () => backend.addOption(kind, name)),
    renameOption: (kind, id, name) => mutate(null, () => backend.renameOption(kind, id, name)),
    deleteOption: (kind, id) => mutate(null, () => backend.deleteOption(kind, id)),
  };
}
