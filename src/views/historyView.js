// Histórico: quién va más, dónde vamos más, mapa y lista de quedadas.

import { SLOTS } from '../constants.js';
import { formatLongDate, monthName, weekdayNameOf, weekdayShort } from '../logic/dates.js';
import { historyStats, historyYears, myAnswer } from '../logic/events.js';
import { formatScore } from '../logic/polls.js';
import { h, cx } from '../ui/dom.js';
import { avatar, avatarStack, card, plural, progressBar } from '../ui/components.js';
import { attempt } from '../ui/feedback.js';
import { placesMap } from '../ui/map.js';
import { pageIntro } from './pageIntro.js';

const MEDALS = ['🥇', '🥈', '🥉'];

const tile = (value, label) =>
  h('div', { class: 'stat-tile' }, h('strong', { class: 'stat-tile__value' }, value), h('span', { class: 'stat-tile__label' }, label));

function yearPicker(years, year, ctx) {
  if (years.length < 2) return null;
  return h('div', { class: 'year-picker', role: 'group', 'aria-label': 'Año' }, years.map((y) => h('button', {
    type: 'button',
    class: cx('chip-btn', y === year && 'is-active'),
    'aria-pressed': String(y === year),
    onClick: () => { ctx.ui.historyYear = y; ctx.rerender(); },
  }, String(y))));
}

function peopleCard(stats, ctx) {
  const { profilesById } = ctx;
  const ranked = stats.people.filter((p) => p.count > 0);
  const absent = stats.people.filter((p) => p.count === 0);
  return card(
    { title: 'Quién va más', emoji: '🏆', subtitle: `Sobre ${plural(stats.total, 'quedada', 'quedadas')}. Cuenta haber dicho «voy».` },
    h('ol', { class: 'rank-list' }, ranked.map((p, i) => h('li', { class: 'rank-row' },
      h('span', { class: 'rank-row__pos' }, MEDALS[i] ?? `${i + 1}.`),
      avatar(profilesById[p.profile_id]),
      h('span', { class: 'rank-row__body' },
        h('span', { class: 'rank-row__top' },
          h('span', { class: 'rank-row__name' }, profilesById[p.profile_id]?.name),
          h('span', { class: 'rank-row__value' }, `${p.count} · ${p.pct}%`)),
        progressBar(p.pct),
        h('span', { class: 'rank-row__detail' }, `🍽 ${plural(p.dinners, 'cena', 'cenas')} · ✨ ${plural(p.plans, 'plan', 'planes')}`))))),
    absent.length > 0 && h('p', { class: 'muted rank-absent' },
      'Aún sin quedadas: ', avatarStack(absent.map((p) => p.profile_id), profilesById, { size: 'xs', max: 14 })),
  );
}

function placesCard(stats) {
  const max = Math.max(1, ...stats.places.map((p) => p.count));
  return card(
    { title: 'Dónde vamos más', emoji: '📍', subtitle: plural(stats.places.length, 'sitio distinto', 'sitios distintos') },
    placesMap(stats.places),
    stats.places.length > 0 && h('ol', { class: 'rank-list' }, stats.places.map((p, i) => h('li', { class: 'rank-row' },
      h('span', { class: 'rank-row__pos' }, MEDALS[i] ?? `${i + 1}.`),
      h('span', { class: 'rank-row__body' },
        h('span', { class: 'rank-row__top' },
          h('span', { class: 'rank-row__name' }, p.name),
          h('span', { class: 'rank-row__value' }, plural(p.count, 'vez', 'veces'))),
        progressBar(Math.round((p.count / max) * 100)),
        p.address && h('span', { class: 'rank-row__detail' }, p.address)),
      p.maps_url && h('a', {
        class: 'icon-btn', href: p.maps_url, target: '_blank', rel: 'noopener', 'aria-label': `Ver ${p.name} en Google Maps`,
      }, '🗺')))),
  );
}

function timelineItem(event, ctx) {
  const { me, store, profilesById } = ctx;
  const answer = myAnswer(event, me.id);
  const slot = SLOTS.find((s) => s.id === event.slot);
  const toggle = (going, label) => h('button', {
    type: 'button',
    class: cx('mini-toggle', answer === going && 'is-selected'),
    'aria-pressed': String(answer === going),
    onClick: () => attempt(() => store.setAttendance(me.id, event.id, answer === going ? null : going)),
  }, label);

  return h('li', { class: 'timeline__item' },
    h('div', { class: 'timeline__date' },
      h('span', {}, weekdayShort(event.event_date)),
      h('strong', {}, Number(event.event_date.slice(8, 10)))),
    h('div', { class: 'timeline__body' },
      h('p', { class: 'timeline__title' }, event.kind === 'dinner' ? '🍽 ' : '✨ ', event.title),
      h('p', { class: 'timeline__meta' },
        formatLongDate(event.event_date),
        event.kind === 'dinner' && event.event_time ? ` · ${event.event_time}` : '',
        slot ? ` · ${slot.label}` : ''),
      h('div', { class: 'timeline__people' },
        avatarStack(event.attendees, profilesById, { size: 'xs', max: 8 }) ?? h('span', { class: 'muted' }, 'Nadie marcó que fue'),
        h('span', { class: 'timeline__toggles' }, toggle(true, 'Fui'), toggle(false, 'No fui')))));
}

function timelineCard(stats, ctx) {
  const byMonth = new Map();
  for (const e of stats.events) {
    const key = e.event_date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(e);
  }
  return card(
    { title: 'Todas las quedadas', emoji: '🗓', subtitle: 'Si alguien se olvidó de responder, puede marcar aquí si fue.' },
    [...byMonth].map(([month, events]) => h('div', { class: 'timeline' },
      h('h4', { class: 'week__title' }, monthName(`${month}-01`)),
      h('ul', { class: 'timeline__list' }, events.map((e) => timelineItem(e, ctx))))),
  );
}

export function renderHistoryView(ctx) {
  const { state, ui } = ctx;
  const years = historyYears(state.events, state.today);
  const year = years.includes(ui.historyYear) ? ui.historyYear : years[0];
  const stats = historyStats(state.events, state.profiles, { year, today: state.today });
  const favouriteDay = stats.weekdays[0];

  return h('div', { class: 'view' },
    pageIntro('📊 Histórico', `Nuestro ${year} en quedadas`, yearPicker(years, year, ctx)),
    stats.total === 0
      ? h('section', { class: 'card empty-history' },
        h('span', { class: 'deciding__emoji', 'aria-hidden': 'true' }, '🦆'),
        h('p', { class: 'deciding__title' }, `Todavía no hay quedadas en ${year}`),
        h('p', { class: 'muted' }, 'Cuando confirméis una cena o fijéis un plan y pase la fecha, aparecerá aquí con sus estadísticas.'))
      : [
        h('div', { class: 'stat-grid' },
          tile(stats.total, stats.total === 1 ? 'quedada' : 'quedadas'),
          tile(stats.dinners, '🍽 cenas'),
          tile(stats.plans, '✨ planes'),
          tile(stats.places.length, '📍 sitios'),
          tile(formatScore(Math.round(stats.averageGroup * 10) / 10), '👥 de media'),
          tile(favouriteDay ? weekdayNameOf(favouriteDay.day) : '—', '💖 día favorito')),
        peopleCard(stats, ctx),
        placesCard(stats),
        timelineCard(stats, ctx),
      ]);
}
