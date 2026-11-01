// Tarjeta de una quedada confirmada (cena de la semana o plan del mes) con
// los botones "Voy / No voy".

import { SLOTS } from '../constants.js';
import { formatDayName, formatLongDate } from '../logic/dates.js';
import { attendanceSummary, myAnswer } from '../logic/events.js';
import { h, cx } from '../ui/dom.js';
import { avatarStack } from '../ui/components.js';
import { attempt, confirmDialog, toast } from '../ui/feedback.js';

export function whenText(event) {
  if (event.kind === 'dinner') return `${formatDayName(event.event_date)} · ${event.event_time}`;
  const slot = SLOTS.find((s) => s.id === event.slot);
  return `${formatDayName(event.event_date)} · ${slot ? `${slot.emoji} ${slot.label}` : ''}`;
}

function rsvp(event, ctx) {
  const { me, store, state } = ctx;
  const answer = myAnswer(event, me.id);
  const past = event.event_date < state.today;
  const option = (going, label) => h('button', {
    type: 'button',
    class: cx('rsvp__btn', going ? 'rsvp__btn--yes' : 'rsvp__btn--no', answer === going && 'is-selected'),
    'aria-pressed': String(answer === going),
    onClick: () => attempt(() => store.setAttendance(me.id, event.id, answer === going ? null : going)),
  }, label);

  return h('div', { class: 'rsvp' },
    h('p', { class: 'rsvp__question' }, past ? '¿Fuiste?' : '¿Vas?'),
    h('div', { class: 'rsvp__buttons' },
      option(true, past ? '✅ Fui' : '✅ Voy'),
      option(false, past ? '❌ No fui' : '❌ No voy')));
}

function who(label, ids, profilesById) {
  if (!ids.length) return null;
  return h('div', { class: 'who' },
    h('span', { class: 'who__label' }, `${label} (${ids.length})`),
    avatarStack(ids, profilesById, { size: 'xs', max: 14 }));
}

/**
 * @param opts.title    texto de la cabecera ("Cena de esta semana")
 * @param opts.onEdit   si se indica, muestra el botón de editar
 * @param opts.canDelete muestra el botón de quitar
 */
export function eventCard(event, ctx, { title, onEdit, canDelete = false } = {}) {
  const { state, profilesById, store } = ctx;
  const { going, notGoing, pending } = attendanceSummary(event, state.profiles);
  const isDinner = event.kind === 'dinner';

  const remove = () => confirmDialog({
    title: isDinner ? '¿Quitar la cena de esta semana?' : '¿Quitar el plan fijado?',
    message: 'Se borrará también quién ha dicho que va. Las encuestas no se tocan.',
    confirmText: 'Quitar',
    onConfirm: async () => { await store.deleteEvent(event.id); toast('Quedada quitada'); },
  });

  return h('section', { class: cx('event-card', isDinner ? 'event-card--dinner' : 'event-card--plan') },
    h('div', { class: 'event-card__top' },
      h('span', { class: 'event-card__badge' }, title),
      (onEdit || canDelete) && h('span', { class: 'event-card__tools' },
        onEdit && h('button', { type: 'button', class: 'chip-btn', onClick: onEdit }, '✏️ Cambiar'),
        canDelete && h('button', { type: 'button', class: 'chip-btn', onClick: remove }, '🗑'))),
    h('h3', { class: 'event-card__title' }, isDinner ? '🍽 ' : '✨ ', event.title),
    h('p', { class: 'event-card__when' }, whenText(event)),
    h('p', { class: 'event-card__date muted' }, formatLongDate(event.event_date)),
    isDinner && event.place_address && h('p', { class: 'event-card__address muted' }, event.place_address),
    isDinner && event.maps_url && h('a', {
      class: 'maps-link', href: event.maps_url, target: '_blank', rel: 'noopener',
    }, '📍 Abrir en Google Maps'),
    rsvp(event, ctx),
    h('div', { class: 'event-card__who' },
      who('Van', going, profilesById),
      who('No van', notGoing, profilesById),
      who('Sin responder', pending, profilesById)));
}
