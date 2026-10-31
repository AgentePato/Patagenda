import { DINNER_DAYS } from '../constants.js';
import { formatWeekRange } from '../logic/dates.js';
import { tallyChoices } from '../logic/polls.js';
import { h, cx } from '../ui/dom.js';
import { avatarStack, card, namesList, pill, plural, progressBar } from '../ui/components.js';
import { attempt } from '../ui/feedback.js';
import { editToggle, openAddOption, optionTools } from './optionEditor.js';

function leaderSummary(tally, label) {
  if (!tally.total) return 'Todavía nadie ha votado.';
  const names = tally.leaders.map((id) => label(tally.rows.find((r) => r.id === id)));
  return names.length === 1 ? `Va ganando: ${names[0]}` : `Empate entre ${names.join(' y ')}`;
}

function whenCard(ctx) {
  const { state, me, store, profilesById } = ctx;
  const tally = tallyChoices(DINNER_DAYS, state.dinner_day_votes.map((v) => ({ profile_id: v.profile_id, choice: v.day })));
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
      h('span', { class: 'day-option__count' }, plural(row.count, 'voto', 'votos')),
      progressBar(row.pct),
      h('span', { class: 'day-option__voters' }, avatarStack(row.voters, profilesById) ?? h('span', { class: 'muted' }, '—')));
    })),
    h('p', { class: 'hint' }, mine ? 'Toca otra vez tu opción para quitar el voto.' : 'Toca un día para votar.'),
  );
}

function whereCard(ctx) {
  const { state, me, store, profilesById, ui } = ctx;
  const tally = tallyChoices(state.restaurants, state.restaurant_votes.map((v) => ({ profile_id: v.profile_id, choice: v.restaurant_id })));
  const mine = state.restaurant_votes.find((v) => v.profile_id === me.id)?.restaurant_id ?? null;
  const editing = ui.editing.restaurant;
  const isTie = tally.leaders.length > 1;

  return card(
    { title: '¿Dónde cenamos?', emoji: '🍝', subtitle: leaderSummary(tally, (r) => r.name), actions: editToggle('restaurant', ctx) },
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
            progressBar(row.pct),
            h('span', { class: 'option__meta' },
              h('span', {}, `${plural(row.count, 'voto', 'votos')} · ${row.pct}%`),
              row.voters.length > 0 && h('span', { class: 'option__voters', title: namesList(row.voters, profilesById) },
                avatarStack(row.voters, profilesById))))),
          editing && optionTools('restaurant', row, ctx));
      }))
      : h('p', { class: 'empty' }, 'No hay sitios todavía. ¡Añade el primero!'),
    h('button', { type: 'button', class: 'btn btn--soft btn--block', onClick: () => openAddOption('restaurant', ctx) }, '+ Añadir sitio'),
  );
}

export function renderDinnerView(ctx) {
  return h('div', { class: 'view' },
    h('div', { class: 'view__intro' },
      h('h2', { class: 'view__title' }, 'Dónde cenar este finde'),
      h('p', { class: 'view__subtitle' },
        `Semana del ${formatWeekRange(ctx.state.week_start)} · las votaciones se reinician el lunes a las 00:00`)),
    whenCard(ctx),
    whereCard(ctx));
}
