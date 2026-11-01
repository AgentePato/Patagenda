// Tests de la lógica de negocio. Se ejecutan con:
//   node tests/logic.test.mjs        (si tienes Node)
//   ./tests/run.sh                   (macOS, sin instalar nada)

import { SLOTS } from '../src/constants.js';
import {
  madridToday, weekStartOf, monthStartOf, weekendDaysOfMonth, monthSlots, groupByWeek,
  formatDayName, formatLongDate, formatWeekRange, formatDaysRange, slotKey,
} from '../src/logic/dates.js';
import {
  tallyChoices, availabilityStats, bestSlots, activityScores, topActivities,
  computeFinalPlan, formatScore,
} from '../src/logic/polls.js';
import { attendanceSummary, dinnerDateFor, eventFor, historyStats, historyYears, myAnswer } from '../src/logic/events.js';

const log = typeof console !== 'undefined' ? (...a) => console.log(...a) : print;
let passed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed += 1; log(`  ✓ ${name}`); } catch (e) { failures.push(name); log(`  ✗ ${name}\n    ${e.message}`); }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} esperado ${b}, obtenido ${a}`);
}

// ---------------------------------------------------------------- fechas
log('Fechas (Europe/Madrid)');

test('hoy en Madrid cambia a medianoche de Madrid, no de UTC', () => {
  // 22:30 UTC del domingo 1 nov (invierno, UTC+1) = 23:30 en Madrid → sigue siendo domingo
  eq(madridToday(new Date('2026-11-01T22:30:00Z')), '2026-11-01');
  // 23:00 UTC = 00:00 del lunes en Madrid
  eq(madridToday(new Date('2026-11-01T23:00:00Z')), '2026-11-02');
  // Verano (UTC+2): 22:00 UTC del domingo 7 jun = 00:00 del lunes en Madrid
  eq(madridToday(new Date('2026-06-07T21:59:00Z')), '2026-06-07');
  eq(madridToday(new Date('2026-06-07T22:00:00Z')), '2026-06-08');
});

test('la semana empieza en lunes', () => {
  eq(weekStartOf('2026-11-01'), '2026-10-26'); // domingo
  eq(weekStartOf('2026-11-02'), '2026-11-02'); // lunes
  eq(weekStartOf('2026-11-07'), '2026-11-02'); // sábado
});

test('inicio de mes', () => eq(monthStartOf('2026-11-17'), '2026-11-01'));

test('viernes, sábados y domingos de noviembre 2026', () => {
  eq(weekendDaysOfMonth('2026-11-01'), [
    '2026-11-01', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-13', '2026-11-14', '2026-11-15',
    '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-27', '2026-11-28', '2026-11-29',
  ]);
});

test('tres franjas por día', () => {
  const slots = monthSlots('2026-11-01', SLOTS);
  eq(slots.length, 13 * 3);
  eq(slots.slice(3, 6).map((s) => s.key), ['2026-11-06|manana', '2026-11-06|tarde', '2026-11-06|noche']);
});

test('agrupación por semanas', () => {
  const weeks = groupByWeek(weekendDaysOfMonth('2026-11-01'));
  eq(weeks.length, 5);
  eq(weeks[0].days, ['2026-11-01']);
  eq(weeks[1].days, ['2026-11-06', '2026-11-07', '2026-11-08']);
});

test('febrero de un año bisiesto', () => {
  const days = weekendDaysOfMonth('2028-02-01');
  eq(days[days.length - 1], '2028-02-27'); // domingo 27; el 29 es martes
});

test('textos de fechas', () => {
  eq(formatDayName('2026-11-06'), 'Viernes 6');
  eq(formatLongDate('2026-11-07'), '7 de noviembre de 2026');
  eq(formatWeekRange('2026-10-26'), '26 oct – 1 nov');
  eq(formatDaysRange(['2026-11-06', '2026-11-07', '2026-11-08']), '6 – 8 nov');
});

// ---------------------------------------------------------------- encuestas
log('Encuestas');

test('recuento, porcentajes y opción ganadora', () => {
  const r = tallyChoices(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    [{ profile_id: 'raquel', choice: 'a' }, { profile_id: 'marta', choice: 'a' }, { profile_id: 'diana', choice: 'b' }],
  );
  eq(r.total, 3);
  eq(r.rows.map((x) => [x.count, x.pct]), [[2, 67], [1, 33], [0, 0]]);
  eq(r.rows[0].voters, ['raquel', 'marta']);
  eq(r.leaders, ['a']);
});

test('empate y encuesta sin votos', () => {
  eq(tallyChoices([{ id: 'a' }, { id: 'b' }], [{ profile_id: 'x', choice: 'a' }, { profile_id: 'y', choice: 'b' }]).leaders, ['a', 'b']);
  eq(tallyChoices([{ id: 'a' }], []).leaders, []);
});

test('una persona puede votar varias opciones', () => {
  const r = tallyChoices(
    [{ id: 'viernes' }, { id: 'sabado' }],
    [{ profile_id: 'raquel', choice: 'viernes' }, { profile_id: 'raquel', choice: 'sabado' }, { profile_id: 'marta', choice: 'sabado' }],
  );
  eq(r.total, 2);
  eq(r.rows.map((x) => [x.count, x.pct]), [[1, 50], [2, 100]]);
  eq(r.leaders, ['sabado']);
});

test('votos a opciones borradas se ignoran', () => {
  eq(tallyChoices([{ id: 'a' }], [{ profile_id: 'x', choice: 'zzz' }]).total, 0);
});

test('disponibilidad por franja', () => {
  const slots = monthSlots('2026-11-01', SLOTS);
  const stats = availabilityStats(slots, [
    { profile_id: 'raquel', slot_date: '2026-11-07', slot: 'noche' },
    { profile_id: 'marta', slot_date: '2026-11-07', slot: 'noche' },
    { profile_id: 'marta', slot_date: '2026-11-06', slot: 'tarde' },
  ], 3);
  const noche = stats.find((s) => s.key === slotKey('2026-11-07', 'noche'));
  eq([noche.count, noche.pct, noche.people], [2, 67, ['raquel', 'marta']]);
  eq(bestSlots(stats).map((s) => s.key), ['2026-11-07|noche']);
});

test('media de actividades: los votos ausentes no cuentan como cero', () => {
  const [row] = activityScores([{ id: 'p' }], [
    { profile_id: 'raquel', activity_id: 'p', score: 5 },
    { profile_id: 'marta', activity_id: 'p', score: 4 },
  ]);
  eq([row.count, row.avg], [2, 4.5]);
  eq(activityScores([{ id: 'p' }], [])[0].avg, null);
});

test('empate de medias exacto (8/2 = 12/3)', () => {
  const scores = activityScores([{ id: 'a' }, { id: 'b' }], [
    { profile_id: 'x', activity_id: 'a', score: 3 }, { profile_id: 'y', activity_id: 'a', score: 5 },
    { profile_id: 'x', activity_id: 'b', score: 4 }, { profile_id: 'y', activity_id: 'b', score: 5 },
    { profile_id: 'z', activity_id: 'b', score: 3 },
  ]);
  eq(topActivities(scores).map((s) => s.id), ['a', 'b']);
});

test('formato de puntuación', () => {
  eq(formatScore(4.5), '4,5');
  eq(formatScore(4), '4');
  eq(formatScore(13 / 3), '4,33');
});

// ---------------------------------------------------------------- plan definitivo
log('Plan definitivo');

const SLOTS_NOV = monthSlots('2026-11-01', SLOTS);
const ACTIVITIES = [{ id: 'patinar', name: 'Patinar' }, { id: 'pintar', name: 'Pintar camisetas' }, { id: 'bolos', name: 'Bolos' }];
const av = (profile, date, slot) => ({ profile_id: profile, slot_date: date, slot });
const rate = (profile, activity, score) => ({ profile_id: profile, activity_id: activity, score });

// Ejemplo del enunciado: Viernes 6 tarde = 2, Sábado 7 noche = 3, Domingo 8 mañana = 1.
const EXAMPLE_AVAILABILITY = [
  av('raquel', '2026-11-06', 'tarde'), av('marta', '2026-11-06', 'tarde'),
  av('raquel', '2026-11-07', 'noche'), av('marta', '2026-11-07', 'noche'), av('diana', '2026-11-07', 'noche'),
  av('diana', '2026-11-08', 'manana'),
];
const EXAMPLE_RATINGS = [
  rate('raquel', 'patinar', 5), rate('raquel', 'pintar', 3), rate('raquel', 'bolos', 4),
  rate('marta', 'patinar', 4), rate('marta', 'bolos', 5),
  rate('diana', 'pintar', 5), rate('diana', 'bolos', 3),
];

test('ejemplo del enunciado: sábado 7 noche y gana patinar con 4,5', () => {
  const plan = computeFinalPlan({
    slots: SLOTS_NOV, availability: EXAMPLE_AVAILABILITY, activities: ACTIVITIES, ratings: EXAMPLE_RATINGS, profileCount: 3,
  });
  eq(plan.status, 'ready');
  eq(plan.tie, false);
  const [c] = plan.candidates;
  eq(c.slot.key, '2026-11-07|noche');
  eq(c.attendees, ['raquel', 'marta', 'diana']);
  eq(c.winners.map((w) => [w.id, w.avg, w.count]), [['patinar', 4.5, 2]]);
  const byId = Object.fromEntries(c.scores.map((s) => [s.id, s.avg]));
  eq(byId, { patinar: 4.5, pintar: 4, bolos: 4 });
  eq(c.winners[0].raters.map((r) => r.profile_id), ['raquel', 'marta']);
});

test('solo cuentan las personas disponibles en la franja elegida', () => {
  // El viernes 6 tarde solo pueden Raquel y Marta: Diana (pintar 5) no cuenta.
  const plan = computeFinalPlan({
    slots: SLOTS_NOV,
    availability: [av('raquel', '2026-11-06', 'tarde'), av('marta', '2026-11-06', 'tarde'), av('diana', '2026-11-07', 'noche')],
    activities: ACTIVITIES,
    ratings: [...EXAMPLE_RATINGS, rate('diana', 'patinar', 1)],
    profileCount: 3,
  });
  const [c] = plan.candidates;
  eq(c.slot.key, '2026-11-06|tarde');
  const byId = Object.fromEntries(c.scores.map((s) => [s.id, [s.avg, s.count]]));
  eq(byId, { patinar: [4.5, 2], bolos: [4.5, 2], pintar: [3, 1] });
  eq(c.winners.map((w) => w.id), ['patinar', 'bolos']); // empate de actividades
});

test('empate de franjas: se muestran todas las empatadas', () => {
  const plan = computeFinalPlan({
    slots: SLOTS_NOV,
    availability: [av('raquel', '2026-11-13', 'noche'), av('marta', '2026-11-13', 'noche'),
      av('raquel', '2026-11-06', 'tarde'), av('marta', '2026-11-06', 'tarde')],
    activities: ACTIVITIES, ratings: EXAMPLE_RATINGS, profileCount: 3,
  });
  eq(plan.tie, true);
  eq(plan.candidates.map((c) => c.slot.key), ['2026-11-06|tarde', '2026-11-13|noche']); // orden cronológico
});

test('sin votos suficientes: todavía se está decidiendo', () => {
  const base = { slots: SLOTS_NOV, activities: ACTIVITIES, ratings: EXAMPLE_RATINGS, profileCount: 3 };
  eq(computeFinalPlan({ ...base, availability: [] }).status, 'waiting-availability');
  eq(computeFinalPlan({ ...base, availability: [av('raquel', '2026-11-06', 'tarde')] }).status, 'waiting-availability');
  const noRatings = computeFinalPlan({ ...base, ratings: [], availability: EXAMPLE_AVAILABILITY });
  eq(noRatings.status, 'waiting-ratings');
  eq(noRatings.candidates[0].slot.key, '2026-11-07|noche');
});

// ---------------------------------------------------------------- quedadas e histórico
log('Quedadas e histórico');

const PROFILES = [{ id: 'aroa' }, { id: 'raquel' }, { id: 'marta' }];
const go = (profile_id, going = true) => ({ profile_id, going });
const EVENTS = [
  { id: 1, kind: 'dinner', period_start: '2026-10-26', event_date: '2026-10-31', title: 'Sushi Bar', restaurant_id: 'r1', lat: 1, lng: 2,
    attendance: [go('aroa'), go('raquel'), go('marta', false)] },
  { id: 2, kind: 'dinner', period_start: '2026-10-19', event_date: '2026-10-23', title: 'Sushi Bar', restaurant_id: 'r1', lat: 1, lng: 2,
    attendance: [go('raquel')] },
  { id: 3, kind: 'dinner', period_start: '2026-10-12', event_date: '2026-10-17', title: 'Pizzería', restaurant_id: 'r2', lat: 3, lng: 4,
    attendance: [go('raquel'), go('marta')] },
  { id: 4, kind: 'plan', period_start: '2026-10-01', event_date: '2026-10-10', slot: 'tarde', title: 'Ir a patinar',
    attendance: [go('aroa'), go('marta')] },
  { id: 5, kind: 'dinner', period_start: '2026-11-02', event_date: '2026-11-06', title: 'Futuro', restaurant_id: 'r3', attendance: [go('aroa')] },
  { id: 6, kind: 'dinner', period_start: '2025-12-15', event_date: '2025-12-19', title: 'Pizzería', restaurant_id: 'r2', attendance: [go('aroa')] },
];

test('cena de la semana y fecha según el día votado', () => {
  eq(eventFor(EVENTS, 'dinner', '2026-10-26').id, 1);
  eq(eventFor(EVENTS, 'plan', '2026-11-01'), null);
  eq(dinnerDateFor('2026-11-02', 'viernes'), '2026-11-06');
  eq(dinnerDateFor('2026-11-02', 'sabado'), '2026-11-07');
});

test('resumen de asistencia', () => {
  eq(attendanceSummary(EVENTS[0], PROFILES), { going: ['aroa', 'raquel'], notGoing: ['marta'], pending: [] });
  eq(attendanceSummary(null, PROFILES).pending, ['aroa', 'raquel', 'marta']);
  eq([myAnswer(EVENTS[0], 'marta'), myAnswer(EVENTS[0], 'pepe')], [false, null]);
});

test('histórico: solo quedadas pasadas del año elegido', () => {
  const s = historyStats(EVENTS, PROFILES, { year: 2026, today: '2026-11-01' });
  eq([s.total, s.dinners, s.plans], [4, 3, 1]);
  eq(s.events.map((e) => e.id), [1, 2, 3, 4]);
  eq(historyYears(EVENTS, '2026-11-01'), [2026, 2025]);
});

test('histórico: quién va más (decir "no voy" no cuenta)', () => {
  const s = historyStats(EVENTS, PROFILES, { year: 2026, today: '2026-11-01' });
  eq(s.people.map((p) => [p.profile_id, p.count, p.pct]), [['raquel', 3, 75], ['aroa', 2, 50], ['marta', 2, 50]]);
  eq(s.people.find((p) => p.profile_id === 'marta'), { profile_id: 'marta', count: 2, dinners: 1, plans: 1, pct: 50 });
});

test('histórico: sitios más repetidos y día favorito', () => {
  const s = historyStats(EVENTS, PROFILES, { year: 2026, today: '2026-11-01' });
  eq(s.places.map((p) => [p.name, p.count]), [['Sushi Bar', 2], ['Pizzería', 1]]);
  eq(s.weekdays[0], { day: 6, count: 3 }); // sábados: 31 oct, 17 oct, 10 oct
  eq(Math.round(s.averageGroup * 100) / 100, 1.75);
});

log(`\n${passed} tests correctos, ${failures.length} fallidos`);
if (failures.length) throw new Error(`Tests fallidos: ${failures.join(', ')}`);
