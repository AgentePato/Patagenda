// Lógica de las encuestas y del plan definitivo. Funciones puras: reciben
// datos y devuelven resultados, sin tocar la interfaz ni la base de datos.

import { MIN_ATTENDEES } from '../constants.js';

export const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** "4,5" — máximo dos decimales, con coma. */
export const formatScore = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Recuento de una encuesta. Cada persona puede votar una o varias opciones;
 * el porcentaje de cada opción es sobre las personas que han votado.
 * @param options [{ id, ... }]
 * @param votes   [{ profile_id, choice }]
 * @returns { rows: [{ ...option, count, pct, voters }], total (personas), leaders: [id] }
 */
export function tallyChoices(options, votes) {
  const rows = options.map((o) => ({ ...o, count: 0, pct: 0, voters: [] }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const people = new Set();
  for (const v of votes) {
    const row = byId.get(v.choice);
    if (!row) continue;
    row.voters.push(v.profile_id);
    row.count += 1;
    people.add(v.profile_id);
  }
  const total = people.size;
  rows.forEach((r) => { r.pct = percent(r.count, total); });
  const max = Math.max(0, ...rows.map((r) => r.count));
  const leaders = max > 0 ? rows.filter((r) => r.count === max).map((r) => r.id) : [];
  return { rows, total, leaders };
}

/**
 * Disponibilidad por franja.
 * @param slots        [{ key, date, slot }] (en orden cronológico)
 * @param availability [{ profile_id, slot_date, slot }]
 * @returns [{ ...slot, people, count, pct }] en el mismo orden que slots
 */
export function availabilityStats(slots, availability, profileCount) {
  const people = new Map();
  for (const a of availability) {
    const key = `${a.slot_date}|${a.slot}`;
    if (!people.has(key)) people.set(key, []);
    people.get(key).push(a.profile_id);
  }
  return slots.map((s) => {
    const p = people.get(s.key) ?? [];
    return { ...s, people: p, count: p.length, pct: percent(p.length, profileCount) };
  });
}

/** Franjas con más personas disponibles (varias si hay empate; ninguna si nadie ha marcado). */
export function bestSlots(stats) {
  const max = Math.max(0, ...stats.map((s) => s.count));
  return max > 0 ? stats.filter((s) => s.count === max) : [];
}

const isValidScore = (score) => Number.isInteger(score) && score >= 1 && score <= 5;

/**
 * Puntuación media de cada actividad. Solo cuentan las personas que han
 * puntuado esa actividad: un voto ausente NO es un cero.
 * @param eligible si se indica, solo cuentan las puntuaciones de esas personas.
 * @returns [{ ...activity, raters: [{ profile_id, score }], count, sum, avg }]
 */
export function activityScores(activities, ratings, eligible = null) {
  const allowed = eligible ? new Set(eligible) : null;
  return activities.map((a) => {
    const raters = ratings
      .filter((r) => r.activity_id === a.id && isValidScore(r.score) && (!allowed || allowed.has(r.profile_id)))
      .map((r) => ({ profile_id: r.profile_id, score: r.score }));
    const sum = raters.reduce((t, r) => t + r.score, 0);
    return { ...a, raters, count: raters.length, sum, avg: raters.length ? sum / raters.length : null };
  });
}

// Compara medias sin decimales flotantes (a.sum/a.count vs b.sum/b.count).
const compareAverages = (a, b) => a.sum * b.count - b.sum * a.count;

/** Actividades con la media más alta (varias si hay empate; ninguna si no hay puntuaciones). */
export function topActivities(scores) {
  let best = [];
  for (const row of scores) {
    if (row.count === 0) continue;
    const cmp = best.length ? compareAverages(row, best[0]) : 1;
    if (cmp > 0) best = [row];
    else if (cmp === 0) best.push(row);
  }
  return best;
}

/** Actividades ordenadas de mayor a menor media; las que no tienen votos, al final. */
export function rankActivities(scores) {
  return [...scores].sort((a, b) => {
    if (!a.count || !b.count) return b.count - a.count;
    return compareAverages(b, a);
  });
}

/**
 * Plan definitivo del mes.
 *  Paso 1: franja(s) con más personas disponibles.
 *  Paso 2: para cada una, actividad con mejor media contando SOLO a las
 *          personas disponibles en esa franja que han puntuado la actividad.
 *
 * @returns {
 *   status: 'waiting-availability' | 'waiting-ratings' | 'ready',
 *   maxAttendees, tie,
 *   candidates: [{ slot, attendees, scores, winners }]
 * }
 */
export function computeFinalPlan(
  { slots, availability, activities, ratings, profileCount },
  { minAttendees = MIN_ATTENDEES } = {},
) {
  const best = bestSlots(availabilityStats(slots, availability, profileCount));
  const maxAttendees = best.length ? best[0].count : 0;

  if (maxAttendees < minAttendees) {
    return { status: 'waiting-availability', maxAttendees, tie: false, candidates: [] };
  }

  const candidates = best.map((slot) => {
    const scores = activityScores(activities, ratings, slot.people);
    return { slot, attendees: slot.people, scores: rankActivities(scores), winners: topActivities(scores) };
  });

  return {
    status: candidates.some((c) => c.winners.length) ? 'ready' : 'waiting-ratings',
    maxAttendees,
    tie: candidates.length > 1,
    candidates,
  };
}
