import { RATINGS, SLOTS } from '../constants.js';
import {
  formatDayName, formatDaysRange, formatMonth, groupByWeek, monthSlots, weekdayShort, weekendDaysOfMonth,
} from '../logic/dates.js';
import { activityScores, availabilityStats, bestSlots, formatScore, topActivities } from '../logic/polls.js';
import { h, cx } from '../ui/dom.js';
import { avatar, avatarStack, card, namesList, pill, plural } from '../ui/components.js';
import { attempt, confirmDialog, toast } from '../ui/feedback.js';
import { editToggle, openAddOption, optionTools } from './optionEditor.js';
import { renderFinalPlan } from './finalPlan.js';
import { eventCard } from './eventCard.js';
import { pageIntro } from './pageIntro.js';
import { eventFor } from '../logic/events.js';

const slotMeta = (id) => SLOTS.find((s) => s.id === id);
const slotLabel = (stat) => `${formatDayName(stat.date)} · ${slotMeta(stat.slot).label}`;

// ---------------------------------------------------------------- disponibilidad
function bestBox(best, profileCount) {
  if (!best.length) return h('p', { class: 'best-box best-box--empty' }, 'Aún nadie ha marcado su disponibilidad.');
  const count = `${best[0].count} de ${profileCount}`;
  if (best.length === 1) {
    return h('p', { class: 'best-box' }, '⭐ Más disponibilidad: ', h('strong', {}, slotLabel(best[0])), ` (${count})`);
  }
  return h('div', { class: 'best-box' },
    h('p', {}, `⭐ Empate entre ${best.length} franjas con ${count}:`),
    h('div', { class: 'best-box__chips' }, best.map((s) => pill(slotLabel(s), 'gold'))));
}

function slotButton(stat, ctx, profileCount, isBest) {
  const { me, store, profilesById } = ctx;
  const meta = slotMeta(stat.slot);
  const mine = stat.people.includes(me.id);
  const who = stat.count ? namesList(stat.people, profilesById) : 'nadie';
  return h('button', {
    type: 'button',
    class: cx('slot', mine && 'is-mine', isBest && 'is-best'),
    style: { '--heat': String(profileCount ? stat.count / profileCount : 0) },
    'aria-pressed': String(mine),
    'aria-label': `${formatDayName(stat.date)}, ${meta.label}. Disponibles: ${who}.`,
    onClick: () => attempt(() => store.setAvailability(me.id, stat.date, stat.slot, !mine)),
  },
  isBest && h('span', { class: 'slot__star', 'aria-hidden': 'true' }, '⭐'),
  h('span', { class: 'slot__label' }, h('span', { 'aria-hidden': 'true' }, meta.emoji), meta.label),
  h('span', { class: 'slot__people' }, avatarStack(stat.people, profilesById, { size: 'xs', max: 3 }) ?? h('span', { class: 'slot__nobody' }, '·')),
  h('span', { class: 'slot__count' }, `${stat.count}/${profileCount} · ${stat.pct}%`));
}

function availabilityCard(ctx) {
  const { state, me, store } = ctx;
  const profileCount = state.profiles.length;
  const stats = availabilityStats(monthSlots(state.month_start, SLOTS), state.availability, profileCount);
  const byKey = new Map(stats.map((s) => [s.key, s]));
  const best = bestSlots(stats);
  const bestKeys = new Set(best.map((s) => s.key));
  const mineCount = state.availability.filter((a) => a.profile_id === me.id).length;
  const weeks = groupByWeek(weekendDaysOfMonth(state.month_start));

  return card(
    {
      title: '¿Qué día y a qué hora podemos quedar?',
      emoji: '📅',
      subtitle: 'Marca todas las franjas en las que puedes. Toca otra vez para desmarcar.',
    },
    bestBox(best, profileCount),
    h('div', { class: 'mine-row' },
      h('p', { class: 'hint hint--top' }, mineCount
        ? `Has marcado ${plural(mineCount, 'franja', 'franjas')} este mes.`
        : 'Todavía no has marcado ninguna franja.'),
      mineCount > 0 && h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--small',
        onClick: () => confirmDialog({
          title: '¿Limpiar tu elección?',
          message: `Se desmarcarán tus ${plural(mineCount, 'franja', 'franjas')} de este mes. Lo que han marcado las demás no se toca.`,
          confirmText: 'Limpiar',
          onConfirm: async () => { await store.clearAvailability(me.id); toast('Elección limpiada'); },
        }),
      }, '🧹 Limpiar elección')),
    weeks.map((week, i) => h('div', { class: 'week' },
      h('h4', { class: 'week__title' }, `Semana ${i + 1}`, h('span', { class: 'week__range' }, formatDaysRange(week.days))),
      week.days.map((day) => h('div', { class: cx('day', day < state.today && 'is-past') },
        h('div', { class: 'day__label' },
          h('span', { class: 'day__weekday' }, weekdayShort(day)),
          h('span', { class: 'day__num' }, Number(day.slice(8, 10))),
          day < state.today && h('span', { class: 'day__past' }, 'pasado')),
        h('div', { class: 'slots' }, SLOTS.map((s) => {
          const stat = byKey.get(`${day}|${s.id}`);
          return slotButton(stat, ctx, profileCount, bestKeys.has(stat.key));
        })))))),
  );
}

// ---------------------------------------------------------------- actividades
function activityItem(row, ctx, isTop) {
  const { state, me, store, profilesById, ui } = ctx;
  const myScore = state.activity_ratings.find((r) => r.profile_id === me.id && r.activity_id === row.id)?.score ?? null;
  const myLabel = RATINGS.find((r) => r.score === myScore)?.label;

  return h('li', { class: cx('activity', isTop && 'is-top') },
    h('div', { class: 'activity__head' },
      h('div', { class: 'activity__title' },
        h('span', { class: 'activity__name' }, row.name),
        isTop && pill('💖 Favorito', 'gold')),
      h('div', { class: 'activity__score' },
        row.count
          ? [h('strong', {}, `★ ${formatScore(row.avg)}`), h('span', {}, plural(row.count, 'voto', 'votos'))]
          : h('span', { class: 'muted' }, 'Sin votos')),
      ui.editing.activity && optionTools('activity', row, ctx)),
    h('div', { class: 'rating', role: 'group', 'aria-label': `Tu puntuación para ${row.name}` },
      RATINGS.map((r) => h('button', {
        type: 'button',
        class: cx('rate-btn', myScore === r.score && 'is-selected'),
        'aria-pressed': String(myScore === r.score),
        'aria-label': `${r.score}: ${r.label}`,
        title: `${r.score} · ${r.label}`,
        onClick: () => attempt(() => store.rateActivity(me.id, row.id, myScore === r.score ? null : r.score)),
      }, h('span', { class: 'rate-btn__emoji', 'aria-hidden': 'true' }, r.emoji), h('span', { class: 'rate-btn__num' }, r.score)))),
    h('div', { class: 'activity__foot' },
      h('span', { class: 'activity__mine' }, myScore ? `Tu voto: ${myScore} · ${myLabel}` : 'Aún no lo has puntuado'),
      row.raters.length > 0 && h('span', { class: 'avatar-stack' },
        row.raters.map((r) => avatar(profilesById[r.profile_id], { size: 'xs', badge: r.score })))));
}

function activitiesCard(ctx) {
  const { state } = ctx;
  const scores = activityScores(state.activities, state.activity_ratings);
  const top = new Set(topActivities(scores).map((r) => r.id));

  return card(
    {
      title: '¿Qué plan hacemos?',
      emoji: '🎳',
      subtitle: 'Puntúa cada plan del 1 (no me apetece nada) al 5 (me apetece muchísimo).',
      actions: editToggle('activity', ctx),
    },
    state.activities.length
      ? h('ul', { class: 'activity-list' }, scores.map((row) => activityItem(row, ctx, top.has(row.id))))
      : h('p', { class: 'empty' }, 'No hay planes todavía. ¡Propón el primero!'),
    h('button', { type: 'button', class: 'btn btn--primary btn--block', onClick: () => openAddOption('activity', ctx) }, '+ Proponer un plan'),
  );
}

// ---------------------------------------------------------------- vista
export function renderMonthView(ctx) {
  const { state } = ctx;
  const planEvent = eventFor(state.events, 'plan', state.month_start);
  return h('div', { class: 'view' },
    pageIntro('✨ Plan mensual', `${formatMonth(state.month_start)} · se reinicia el día 1 a las 00:00`,
      !planEvent && h('a', { class: 'jump-link', href: '#plan-definitivo', onClick: (e) => {
        e.preventDefault();
        document.getElementById('plan-definitivo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } }, '✨ Ver nuestro plan definitivo')),
    planEvent && eventCard(planEvent, ctx, { title: 'Plan de este mes', canDelete: true }),
    availabilityCard(ctx),
    activitiesCard(ctx),
    renderFinalPlan(ctx, planEvent));
}
