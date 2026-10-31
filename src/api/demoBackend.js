// Backend de demostración: guarda los datos en localStorage y sincroniza las
// pestañas del mismo navegador. Sirve para probar la web sin Supabase; NO
// comparte datos entre móviles.

import { DEFAULT_ACTIVITIES, DEFAULT_PROFILES, DEFAULT_RESTAURANTS, NAME_MAX_LENGTH } from '../constants.js';
import { madridToday, monthStartOf, weekStartOf } from '../logic/dates.js';

const STORAGE_KEY = 'patagenda-demo-v1';
const TABLES = { restaurant: 'restaurants', activity: 'activities' };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const option = (name) => ({ id: uid(), name });

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* datos corruptos o almacenamiento bloqueado: empezamos de cero */ }
  return {
    restaurants: DEFAULT_RESTAURANTS.map(option),
    activities: DEFAULT_ACTIVITIES.map(option),
    dinner_day_votes: [],
    restaurant_votes: [],
    availability: [],
    activity_ratings: [],
  };
}

function cleanName(name) {
  const v = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!v) throw new Error('El nombre no puede estar vacío');
  if (v.length > NAME_MAX_LENGTH) throw new Error(`El nombre es demasiado largo (máximo ${NAME_MAX_LENGTH} caracteres)`);
  return v;
}

export function createDemoBackend() {
  let db = load();
  const listeners = new Set();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(STORAGE_KEY) : null;

  const periods = () => {
    const today = madridToday();
    return { today, week: weekStartOf(today), month: monthStartOf(today) };
  };

  function commit(change) {
    db = load();
    change(db);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* sin almacenamiento */ }
    channel?.postMessage('changed');
    setTimeout(() => listeners.forEach((l) => l()), 0);
  }

  channel?.addEventListener('message', () => { db = load(); listeners.forEach((l) => l()); });

  // Un voto por persona y periodo: quita el anterior y, si hay valor, añade el nuevo.
  const upsert = (rows, match, row) => [...rows.filter((r) => !match(r)), ...(row ? [row] : [])];

  return {
    mode: 'demo',

    async getState() {
      db = load();
      const { today, week, month } = periods();
      const strip = (rows) => rows.map(({ period, ...rest }) => rest);
      return {
        today,
        week_start: week,
        month_start: month,
        profiles: DEFAULT_PROFILES,
        restaurants: db.restaurants,
        activities: db.activities,
        dinner_day_votes: strip(db.dinner_day_votes.filter((v) => v.period === week)),
        restaurant_votes: strip(db.restaurant_votes.filter((v) => v.period === week)),
        availability: strip(db.availability.filter((v) => v.period === month)),
        activity_ratings: strip(db.activity_ratings.filter((v) => v.period === month)),
      };
    },

    async voteDinnerDay(profileId, day) {
      const { week } = periods();
      commit((d) => {
        d.dinner_day_votes = upsert(d.dinner_day_votes, (v) => v.period === week && v.profile_id === profileId,
          day && { period: week, profile_id: profileId, day });
      });
    },

    async voteRestaurant(profileId, restaurantId) {
      const { week } = periods();
      commit((d) => {
        d.restaurant_votes = upsert(d.restaurant_votes, (v) => v.period === week && v.profile_id === profileId,
          restaurantId && { period: week, profile_id: profileId, restaurant_id: restaurantId });
      });
    },

    async setAvailability(profileId, date, slot, available) {
      const { month } = periods();
      if (monthStartOf(date) !== month) throw new Error('Esa fecha no es de este mes');
      commit((d) => {
        d.availability = upsert(d.availability,
          (v) => v.profile_id === profileId && v.slot_date === date && v.slot === slot,
          available && { period: month, profile_id: profileId, slot_date: date, slot });
      });
    },

    async rateActivity(profileId, activityId, score) {
      const { month } = periods();
      commit((d) => {
        d.activity_ratings = upsert(d.activity_ratings,
          (v) => v.period === month && v.profile_id === profileId && v.activity_id === activityId,
          score && { period: month, profile_id: profileId, activity_id: activityId, score });
      });
    },

    async addOption(kind, name) {
      const clean = cleanName(name);
      commit((d) => {
        const rows = d[TABLES[kind]];
        if (rows.some((r) => r.name.toLowerCase() === clean.toLowerCase())) throw new Error('Ya existe una opción con ese nombre');
        rows.push(option(clean));
      });
    },

    async renameOption(kind, id, name) {
      const clean = cleanName(name);
      commit((d) => {
        const rows = d[TABLES[kind]];
        if (rows.some((r) => r.id !== id && r.name.toLowerCase() === clean.toLowerCase())) throw new Error('Ya existe una opción con ese nombre');
        const row = rows.find((r) => r.id === id);
        if (!row) throw new Error('Esa opción ya no existe');
        row.name = clean;
      });
    },

    async deleteOption(kind, id) {
      commit((d) => {
        d[TABLES[kind]] = d[TABLES[kind]].filter((r) => r.id !== id);
        if (kind === 'restaurant') d.restaurant_votes = d.restaurant_votes.filter((v) => v.restaurant_id !== id);
        else d.activity_ratings = d.activity_ratings.filter((v) => v.activity_id !== id);
      });
    },

    subscribe(onChange, onStatus) {
      listeners.add(onChange);
      onStatus('demo');
      return () => listeners.delete(onChange);
    },
  };
}
