// Página de inicio: avisos de las quedadas confirmadas y acceso a las
// secciones.

import { eventFor, historyStats } from '../logic/events.js';
import { h } from '../ui/dom.js';
import { plural } from '../ui/components.js';
import { eventCard, whenText } from './eventCard.js';
import { dayTally, placeTally } from './dinnerView.js';

function dinnerStatus(state, dinner) {
  if (dinner) return `✅ Confirmada: ${whenText(dinner)} en ${dinner.title}`;
  const days = dayTally(state);
  const places = placeTally(state);
  if (!days.total && !places.total) return 'Todavía nadie ha votado esta semana';
  const day = days.leaders.length === 1 ? days.rows.find((r) => r.id === days.leaders[0]).label : null;
  const place = places.leaders.length === 1 ? places.rows.find((r) => r.id === places.leaders[0]).name : null;
  const leading = [day, place].filter(Boolean).join(' · ');
  return leading ? `Va ganando: ${leading}` : 'Hay empate, ¡vota para desempatar!';
}

function planStatus(state, plan) {
  if (plan) return `✅ Fijado: ${plan.title} · ${whenText(plan)}`;
  const people = new Set(state.availability.map((a) => a.profile_id)).size;
  return `${people} de ${state.profiles.length} han marcado su disponibilidad`;
}

const navCard = (href, emoji, title, status, tone) =>
  h('a', { class: `nav-card nav-card--${tone}`, href },
    h('span', { class: 'nav-card__emoji', 'aria-hidden': 'true' }, emoji),
    h('span', { class: 'nav-card__text' },
      h('strong', { class: 'nav-card__title' }, title),
      h('span', { class: 'nav-card__status' }, status)),
    h('span', { class: 'nav-card__arrow', 'aria-hidden': 'true' }, '→'));

export function renderHomeView(ctx) {
  const { state, me } = ctx;
  const dinner = eventFor(state.events, 'dinner', state.week_start);
  const plan = eventFor(state.events, 'plan', state.month_start);
  const upcomingPlan = plan && plan.event_date >= state.today ? plan : null;
  const year = Number(state.today.slice(0, 4));
  const pastThisYear = historyStats(state.events, state.profiles, { year, today: state.today }).total;

  return h('div', { class: 'view' },
    h('div', { class: 'view__intro' },
      h('h2', { class: 'view__title' }, `¡Hola, ${me.name}! ${me.emoji ?? ''}`),
      h('p', { class: 'view__subtitle' }, '¿Qué organizamos?')),
    dinner && eventCard(dinner, ctx, { title: 'Cena de esta semana' }),
    upcomingPlan && eventCard(upcomingPlan, ctx, { title: 'Plan de este mes' }),
    h('nav', { class: 'nav-cards', 'aria-label': 'Secciones' },
      navCard('#/cena', '🍝', 'Cena semanal', dinnerStatus(state, dinner), 'dinner'),
      navCard('#/plan', '✨', 'Plan mensual', planStatus(state, plan), 'plan'),
      navCard('#/historico', '📊', 'Histórico', `${plural(pastThisYear, 'quedada', 'quedadas')} en ${year}`, 'history')));
}
