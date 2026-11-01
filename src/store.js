// Estado compartido de la app. Cada acción se aplica al momento en pantalla
// (optimista), se envía al backend y después se vuelve a leer el estado
// real del servidor, que es siempre la fuente de verdad.

const EMPTY = {
  profiles: [], restaurants: [], activities: [],
  dinner_day_votes: [], restaurant_votes: [], availability: [], activity_ratings: [], events: [],
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

    voteDinnerDay: (profileId, day, on) => mutate(
      (s) => {
        s.dinner_day_votes = replace(s.dinner_day_votes, (v) => v.profile_id === profileId && v.day === day,
          on && { profile_id: profileId, day });
      },
      () => backend.voteDinnerDay(profileId, day, on),
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

    // Quita todas las franjas marcadas por esa persona este mes.
    clearAvailability: (profileId) => {
      const mine = (state?.availability ?? []).filter((a) => a.profile_id === profileId);
      return mutate(
        (s) => { s.availability = s.availability.filter((a) => a.profile_id !== profileId); },
        () => Promise.all(mine.map((a) => backend.setAvailability(profileId, a.slot_date, a.slot, false))),
      );
    },

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
    addPlace: (place) => mutate(null, () => backend.addPlace(place)),

    setDinner: (profileId, date, time, restaurantId) =>
      mutate(null, () => backend.setDinner(profileId, date, time, restaurantId)),
    setPlanEvent: (profileId, date, slot, activityId) =>
      mutate(null, () => backend.setPlanEvent(profileId, date, slot, activityId)),
    deleteEvent: (id) => mutate((s) => { s.events = s.events.filter((e) => e.id !== id); }, () => backend.deleteEvent(id)),

    setAttendance: (profileId, eventId, going) => mutate(
      (s) => {
        const event = s.events.find((e) => e.id === eventId);
        if (event) {
          event.attendance = replace(event.attendance, (a) => a.profile_id === profileId,
            going != null && { profile_id: profileId, going });
        }
      },
      () => backend.setAttendance(profileId, eventId, going),
    ),
  };
}
