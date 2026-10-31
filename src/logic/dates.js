// Fechas como cadenas 'YYYY-MM-DD' (sin hora), calculadas en UTC para que
// sumar días no dependa de la zona horaria del móvil.

export const TIME_ZONE = 'Europe/Madrid';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const WEEKEND = [5, 6, 0]; // viernes, sábado, domingo

/** Fecha de hoy en Madrid. */
export function madridToday(now = new Date()) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const toISO = (date) => date.toISOString().slice(0, 10);

export function addDays(iso, days) {
  const date = toUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** 0 = domingo … 6 = sábado */
export const weekday = (iso) => toUTC(iso).getUTCDay();

/** Lunes de la semana de esa fecha. */
export const weekStartOf = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));

export const monthStartOf = (iso) => `${iso.slice(0, 8)}01`;

/** Viernes, sábados y domingos del mes, en orden. */
export function weekendDaysOfMonth(monthStart) {
  const days = [];
  const month = monthStart.slice(0, 7);
  for (let d = monthStart; d.slice(0, 7) === month; d = addDays(d, 1)) {
    if (WEEKEND.includes(weekday(d))) days.push(d);
  }
  return days;
}

export const slotKey = (date, slot) => `${date}|${slot}`;

/** Todas las opciones de la encuesta mensual: cada día de finde × cada franja. */
export function monthSlots(monthStart, slots) {
  return weekendDaysOfMonth(monthStart).flatMap((date) =>
    slots.map((s) => ({ key: slotKey(date, s.id), date, slot: s.id })));
}

/** Agrupa fechas por semana (lunes a domingo). */
export function groupByWeek(dates) {
  const weeks = new Map();
  for (const d of dates) {
    const start = weekStartOf(d);
    if (!weeks.has(start)) weeks.set(start, []);
    weeks.get(start).push(d);
  }
  return [...weeks].map(([weekStart, days]) => ({ weekStart, days }));
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Viernes" */
export const weekdayName = (iso) => capitalize(WEEKDAYS[weekday(iso)]);

/** "Vie" */
export const weekdayShort = (iso) => WEEKDAYS_SHORT[weekday(iso)];

/** "Viernes 6" */
export const formatDayName = (iso) => `${weekdayName(iso)} ${Number(iso.slice(8, 10))}`;

/** "6 de noviembre de 2026" */
export function formatLongDate(iso) {
  const date = toUTC(iso);
  return `${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

/** "Noviembre 2026" */
export function formatMonth(monthStart) {
  const date = toUTC(monthStart);
  return `${capitalize(MONTHS[date.getUTCMonth()])} ${date.getUTCFullYear()}`;
}

const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;

/** "26 oct – 1 nov" */
export const formatWeekRange = (weekStart) => `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;

/** "6 – 8 nov" para un grupo de días de una misma semana */
export function formatDaysRange(days) {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return shortDate(first);
  return first.slice(5, 7) === last.slice(5, 7)
    ? `${Number(first.slice(8, 10))} – ${shortDate(last)}`
    : `${shortDate(first)} – ${shortDate(last)}`;
}
