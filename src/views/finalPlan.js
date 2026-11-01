import { MIN_ATTENDEES, SLOTS } from '../constants.js';
import { formatLongDate, monthSlots, weekdayName, weekdayShort } from '../logic/dates.js';
import { computeFinalPlan, formatScore } from '../logic/polls.js';
import { h } from '../ui/dom.js';
import { avatarStack, namesList } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';

const fact = (label, value, extra) =>
  h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, h('span', { class: 'fact__value' }, value), extra));

// Quién ha votado ya y a quién le falta, en dos líneas.
function participation(ctx) {
  const { state, profilesById } = ctx;
  const row = (label, doneIds) => {
    const missing = state.profiles.map((p) => p.id).filter((id) => !doneIds.has(id));
    return h('li', {},
      h('span', { class: 'participation__name' }, `${label}: ${doneIds.size}/${state.profiles.length}`),
      missing.length
        ? h('span', { class: 'participation__missing' }, 'Faltan ', avatarStack(missing, profilesById, { size: 'xs', max: 7 }))
        : h('span', { class: 'ok' }, '✓ Todas'));
  };
  return h('ul', { class: 'participation' },
    row('📅 Disponibilidad', new Set(state.availability.map((a) => a.profile_id))),
    row('⭐ Puntuaciones', new Set(state.activity_ratings.map((r) => r.profile_id))));
}

function activityFacts(candidate, profilesById) {
  const { winners } = candidate;
  if (!winners.length) {
    return fact('Plan', 'Por decidir', h('span', { class: 'fact__extra' }, 'Falta que las que pueden ir puntúen los planes.'));
  }
  const raters = (w) => w.raters.map((r) => `${profilesById[r.profile_id]?.name} (${r.score})`).join(', ');
  return [
    fact(winners.length > 1 ? 'Empate de planes' : 'Plan ganador',
      winners.map((w) => w.name).join(' · '),
      h('span', { class: 'fact__extra' }, `★ ${formatScore(winners[0].avg)} de media`)),
    fact('Personas incluidas en el cálculo',
      winners.length === 1 ? raters(winners[0]) : null,
      winners.length > 1 && h('ul', { class: 'fact__list' }, winners.map((w) => h('li', {}, `${w.name}: ${raters(w)}`)))),
  ];
}

// Botones para guardar este resultado como el plan del mes (uno por actividad si hay empate).
function fixButtons(candidate, ctx, planEvent) {
  const { me, store } = ctx;
  const { slot, winners } = candidate;
  return h('div', { class: 'plan__fix' }, winners.map((w) => {
    const isFixed = planEvent && planEvent.event_date === slot.date && planEvent.slot === slot.slot && planEvent.title === w.name;
    return h('button', {
      type: 'button',
      class: isFixed ? 'btn btn--soft' : 'btn btn--primary',
      disabled: isFixed,
      onClick: () => attempt(async () => {
        await store.setPlanEvent(me.id, slot.date, slot.slot, w.id);
        toast('¡Plan fijado! Ya podéis decir si vais 🎉', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }),
    }, isFixed ? '📌 Es el plan fijado' : winners.length > 1 ? `📌 Fijar con ${w.name}` : '📌 Fijar este plan');
  }));
}

function candidateBlock(candidate, ctx, planEvent) {
  const { state, profilesById } = ctx;
  const { slot, attendees, scores } = candidate;
  const meta = SLOTS.find((s) => s.id === slot.slot);

  return h('article', { class: 'plan' },
    h('div', { class: 'plan__when' },
      h('div', { class: 'plan__tile' },
        h('span', {}, weekdayShort(slot.date)),
        h('strong', {}, Number(slot.date.slice(8, 10)))),
      h('div', {},
        h('p', { class: 'plan__day' }, weekdayName(slot.date)),
        h('p', { class: 'plan__date' }, formatLongDate(slot.date)),
        h('p', { class: 'plan__slot' }, `${meta.emoji} Por la ${meta.label.toLowerCase()}`))),
    h('dl', { class: 'plan__facts' },
      fact('Pueden asistir', `${attendees.length} de ${state.profiles.length}`,
        h('span', { class: 'fact__extra fact__people' }, avatarStack(attendees, profilesById, { size: 'xs', max: 8 }), namesList(attendees, profilesById))),
      activityFacts(candidate, profilesById)),
    candidate.winners.length > 0 && fixButtons(candidate, ctx, planEvent),
    h('details', {
      class: 'plan__details',
      open: ctx.ui.openDetails.has(slot.key),
      // Recordamos si está abierto para que no se cierre cuando llega un voto nuevo.
      onToggle: (e) => { if (e.target.open) ctx.ui.openDetails.add(slot.key); else ctx.ui.openDetails.delete(slot.key); },
    },
      h('summary', {}, 'Ver cómo se ha calculado'),
      h('p', { class: 'muted' }, `Medias de cada plan contando solo a quien puede ir (${namesList(attendees, profilesById)}) y lo ha puntuado:`),
      h('ol', { class: 'ranking' }, scores.map((s) => h('li', {},
        h('span', {}, s.name),
        h('span', { class: 'ranking__score' }, s.count ? `★ ${formatScore(s.avg)} (${s.sum}/${s.count})` : 'sin votos'))))));
}

export function renderFinalPlan(ctx, planEvent = null) {
  const { state } = ctx;
  const plan = computeFinalPlan({
    slots: monthSlots(state.month_start, SLOTS),
    availability: state.availability,
    activities: state.activities,
    ratings: state.activity_ratings,
    profileCount: state.profiles.length,
  });

  let body;
  if (plan.status === 'waiting-availability') {
    body = [
      h('div', { class: 'deciding' },
        h('span', { class: 'deciding__emoji', 'aria-hidden': 'true' }, '💭'),
        h('p', { class: 'deciding__title' }, 'Todavía estamos decidiendo el plan'),
        h('p', { class: 'muted' }, plan.maxAttendees === 0
          ? 'Marcad vuestra disponibilidad y puntuad los planes para encontrar el mejor día.'
          : `De momento no hay ninguna franja en la que puedan al menos ${MIN_ATTENDEES} personas.`)),
      participation(ctx),
    ];
  } else {
    body = [
      plan.tie && h('p', { class: 'tie-note' },
        `🤝 Hay empate entre ${plan.candidates.length} opciones en las que pueden ${plan.maxAttendees} personas. ¡Elegid una!`),
      plan.candidates.map((c) => candidateBlock(c, ctx, planEvent)),
      plan.status === 'waiting-ratings' && participation(ctx),
    ];
  }

  return h('section', { class: 'final', id: 'plan-definitivo' },
    h('span', { class: 'final__badge' }, '✨ Se calcula solo'),
    h('h3', { class: 'final__title' }, 'Nuestro plan definitivo'),
    body);
}
