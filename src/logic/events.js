// Quedadas confirmadas (cena de la semana y plan del mes) y estadísticas del
// histórico. Funciones puras.

import { addDays, weekday } from './dates.js';

/** La quedada de ese tipo y periodo (lunes de la semana o día 1 del mes), si existe. */
export const eventFor = (events, kind, periodStart) =>
  events.find((e) => e.kind === kind && e.period_start === periodStart) ?? null;

/** Fecha de la semana que corresponde al día votado ('viernes' | 'sabado'). */
export const dinnerDateFor = (weekStart, dayId) => addDays(weekStart, dayId === 'sabado' ? 5 : 4);

/** Todos los días de la semana (lunes a domingo). */
export const weekDates = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** Quién va, quién no y quién no ha respondido, en el orden de los perfiles. */
export function attendanceSummary(event, profiles) {
  const answers = new Map((event?.attendance ?? []).map((a) => [a.profile_id, a.going]));
  const going = [];
  const notGoing = [];
  const pending = [];
  for (const p of profiles) {
    if (answers.get(p.id) === true) going.push(p.id);
    else if (answers.get(p.id) === false) notGoing.push(p.id);
    else pending.push(p.id);
  }
  return { going, notGoing, pending };
}

export const myAnswer = (event, profileId) =>
  event?.attendance?.find((a) => a.profile_id === profileId)?.going ?? null;

/** Años con alguna quedada ya celebrada, del más reciente al más antiguo. */
export function historyYears(events, today) {
  const years = new Set(events.filter((e) => e.event_date <= today).map((e) => Number(e.event_date.slice(0, 4))));
  years.add(Number(today.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

const placeKey = (e) => e.restaurant_id ?? (e.lat != null ? `${e.lat},${e.lng}` : e.title.toLowerCase());

/**
 * Estadísticas de las quedadas ya celebradas (fecha <= hoy) de un año.
 * Cuenta como asistencia haber respondido "voy".
 */
export function historyStats(events, profiles, { year, today }) {
  const past = events
    .filter((e) => e.event_date <= today && (year == null || Number(e.event_date.slice(0, 4)) === year))
    .sort((a, b) => (a.event_date < b.event_date ? 1 : -1));

  const attendees = (e) => (e.attendance ?? []).filter((a) => a.going).map((a) => a.profile_id);
  const total = past.length;

  const people = profiles
    .map((p) => {
      const went = past.filter((e) => attendees(e).includes(p.id));
      return {
        profile_id: p.id,
        count: went.length,
        dinners: went.filter((e) => e.kind === 'dinner').length,
        plans: went.filter((e) => e.kind === 'plan').length,
        pct: total ? Math.round((went.length / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const places = new Map();
  for (const e of past.filter((ev) => ev.kind === 'dinner')) {
    const key = placeKey(e);
    if (!places.has(key)) {
      places.set(key, { key, name: e.title, address: e.place_address, lat: e.lat, lng: e.lng, maps_url: e.maps_url, count: 0, dates: [] });
    }
    const place = places.get(key);
    place.count += 1;
    place.dates.push(e.event_date);
  }
  const placeList = [...places.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

  const weekdays = new Map();
  for (const e of past) weekdays.set(weekday(e.event_date), (weekdays.get(weekday(e.event_date)) ?? 0) + 1);

  const groupSizes = past.map((e) => attendees(e).length);

  return {
    events: past.map((e) => ({ ...e, attendees: attendees(e) })),
    total,
    dinners: past.filter((e) => e.kind === 'dinner').length,
    plans: past.filter((e) => e.kind === 'plan').length,
    people,
    places: placeList,
    weekdays: [...weekdays].map(([day, count]) => ({ day, count })).sort((a, b) => b.count - a.count),
    averageGroup: groupSizes.length ? groupSizes.reduce((t, n) => t + n, 0) / groupSizes.length : 0,
  };
}
