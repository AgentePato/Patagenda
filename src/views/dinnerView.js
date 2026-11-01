import { DINNER_DAYS } from '../constants.js';
import { formatWeekRange } from '../logic/dates.js';
import { dinnerDateFor, eventFor } from '../logic/events.js';
import { tallyChoices } from '../logic/polls.js';
import { h, cx } from '../ui/dom.js';
import { avatarStack, card, pill, plural, progressBar } from '../ui/components.js';
import { attempt } from '../ui/feedback.js';
import { editToggle, optionTools } from './optionEditor.js';
import { openPlaceSearch } from './placePicker.js';
import { openDinnerForm } from './dinnerForm.js';
import { eventCard } from './eventCard.js';
import { pageIntro } from './pageIntro.js';

function leaderSummary(tally, label) {
  if (!tally.total) return 'Todavía nadie ha votado.';
  const names = tally.leaders.map((id) => label(tally.rows.find((r) => r.id === id)));
  return names.length === 1 ? `Va ganando: ${names[0]}` : `Empate entre ${names.join(' y ')}`;
}

export const dayTally = (state) =>
  tallyChoices(DINNER_DAYS, state.dinner_day_votes.map((v) => ({ profile_id: v.profile_id, choice: v.day })));

export const placeTally = (state) =>
  tallyChoices(state.restaurants, state.restaurant_votes.map((v) => ({ profile_id: v.profile_id, choice: v.restaurant_id })));

function whenCard(ctx, tally) {
  const { state, me, store, profilesById } = ctx;
  const mine = state.dinner_day_votes.find((v) => v.profile_id === me.id)?.day ?? null;

  return card(
    { title: '¿Cuándo cenamos?', emoji: '🗓', subtitle: leaderSummary(tally, (r) => r.label) },
    h('div', { class: 'day-grid' }, tally.rows.map((row) => {
      const selected = mine === row.id;
      const leading = tally.leaders.includes(row.id);
      return h('button', {
        type: 'button',
        class: cx('day-option', selected && 'is-selected', leading && 'is-leading'),
        'aria-pressed': String(selected),
        onClick: () => attempt(() => store.voteDinnerDay(me.id, selected ? null : row.id)),
      },
      leading && h('span', { class: 'crown', 'aria-hidden': 'true' }, '👑'),
      h('span', { class: 'day-option__emoji', 'aria-hidden': 'true' }, row.emoji),
      h('span', { class: 'day-option__label' }, row.label),
      h('span', { class: 'day-option__count' }, `${plural(row.count, 'voto', 'votos')} · ${row.pct}%`),
      progressBar(row.pct),
      h('span', { class: 'day-option__voters' }, avatarStack(row.voters, profilesById, { max: 6 }) ?? h('span', { class: 'muted' }, '—')));
    })),
    h('p', { class: 'hint' }, mine ? 'Toca otra vez tu opción para quitar el voto.' : 'Toca un día para votar.'),
  );
}

function whereCard(ctx, tally) {
  const { state, me, store, profilesById, ui } = ctx;
  const mine = state.restaurant_votes.find((v) => v.profile_id === me.id)?.restaurant_id ?? null;
  const editing = ui.editing.restaurant;
  const isTie = tally.leaders.length > 1;

  return card(
    {
      title: '¿Dónde cenamos?',
      emoji: '🍝',
      subtitle: leaderSummary(tally, (r) => r.name),
      actions: state.restaurants.length > 0 && editToggle('restaurant', ctx),
    },
    tally.rows.length
      ? h('ul', { class: 'option-list' }, tally.rows.map((row) => {
        const selected = mine === row.id;
        const leading = tally.leaders.includes(row.id);
        return h('li', { class: 'option-row' },
          h('button', {
            type: 'button',
            class: cx('option', selected && 'is-selected', leading && 'is-leading'),
            'aria-pressed': String(selected),
            onClick: () => attempt(() => store.voteRestaurant(me.id, selected ? null : row.id)),
          },
          h('span', { class: 'option__radio', 'aria-hidden': 'true' }),
          h('span', { class: 'option__body' },
            h('span', { class: 'option__top' },
              h('span', { class: 'option__name' }, row.name),
              leading && pill(isTie ? '🤝 Empate' : '👑 Va ganando', 'gold')),
            row.address && h('span', { class: 'option__address' }, row.address),
            progressBar(row.pct),
            h('span', { class: 'option__meta' },
              h('span', {}, `${plural(row.count, 'voto', 'votos')} · ${row.pct}%`),
              avatarStack(row.voters, profilesById, { size: 'xs', max: 6 })))),
          editing
            ? optionTools('restaurant', row, ctx, { rename: false })
            : row.maps_url && h('a', {
              class: 'icon-btn', href: row.maps_url, target: '_blank', rel: 'noopener',
              title: 'Ver en Google Maps', 'aria-label': `Ver ${row.name} en Google Maps`,
            }, '📍'));
      }))
      : h('p', { class: 'empty' }, 'Todavía no hay sitios. Búscalos en el mapa y añádelos 👇'),
    h('button', { type: 'button', class: 'btn btn--soft btn--block', onClick: () => openPlaceSearch(ctx) }, '📍 Añadir sitio desde el mapa'),
  );
}

function confirmedDinner(ctx, days, places) {
  const { state } = ctx;
  const dinner = eventFor(state.events, 'dinner', state.week_start);
  const defaults = {
    date: dinnerDateFor(state.week_start, days.leaders.length === 1 ? days.leaders[0] : 'viernes'),
    restaurantId: places.leaders.length === 1 ? places.leaders[0] : null,
  };

  if (dinner) {
    return eventCard(dinner, ctx, {
      title: 'Cena de esta semana',
      onEdit: () => openDinnerForm(ctx, { existing: dinner }),
      canDelete: true,
    });
  }
  return h('div', { class: 'confirm-box' },
    h('p', {}, h('strong', {}, '¿Ya lo tenéis claro?'), ' Confirma la cena y a todas les saldrá el aviso para decir si van.'),
    h('button', { type: 'button', class: 'btn btn--primary btn--block', onClick: () => openDinnerForm(ctx, { defaults }) },
      '➕ Añadir cena definitiva'));
}

export function renderDinnerView(ctx) {
  const days = dayTally(ctx.state);
  const places = placeTally(ctx.state);
  return h('div', { class: 'view' },
    pageIntro('🍝 Cena semanal',
      `Semana del ${formatWeekRange(ctx.state.week_start)} · las votaciones se reinician el lunes a las 00:00`),
    confirmedDinner(ctx, days, places),
    whenCard(ctx, days),
    whereCard(ctx, places));
}
