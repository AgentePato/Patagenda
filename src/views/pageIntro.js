import { h } from '../ui/dom.js';

/** Cabecera de una página interior, con el botón para volver al inicio. */
export const pageIntro = (title, subtitle, ...extra) =>
  h('div', { class: 'view__intro' },
    h('a', { class: 'back-link', href: '#/' }, '← Inicio'),
    h('h2', { class: 'view__title' }, title),
    subtitle && h('p', { class: 'view__subtitle' }, subtitle),
    extra);
