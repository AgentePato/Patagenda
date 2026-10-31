import { h, cx } from './dom.js';

export function avatar(profile, { size = 'sm', badge = null } = {}) {
  if (!profile) return null;
  return h('span', {
    class: cx('avatar', `avatar--${size}`),
    style: { '--c': profile.color },
    title: profile.name,
    'aria-label': profile.name,
  }, profile.name.charAt(0), badge != null && h('span', { class: 'avatar__badge' }, badge));
}

export function avatarStack(profileIds, profilesById, opts) {
  if (!profileIds.length) return null;
  return h('span', { class: 'avatar-stack' }, profileIds.map((id) => avatar(profilesById[id], opts)));
}

/** "Raquel, Marta y Diana" */
export function namesList(profileIds, profilesById) {
  const names = profileIds.map((id) => profilesById[id]?.name).filter(Boolean);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

export const progressBar = (pct, tone = 'primary') =>
  h('span', { class: cx('bar', `bar--${tone}`), role: 'presentation' },
    h('span', { class: 'bar__fill', style: { width: `${pct}%` } }));

export function card({ title, emoji, subtitle, actions, className }, ...children) {
  return h('section', { class: cx('card', className) },
    h('header', { class: 'card__head' },
      h('div', {},
        h('h3', { class: 'card__title' }, emoji && h('span', { class: 'card__emoji', 'aria-hidden': 'true' }, emoji), title),
        subtitle && h('p', { class: 'card__subtitle' }, subtitle)),
      actions && h('div', { class: 'card__actions' }, actions)),
    children);
}

export const pill = (text, tone = 'neutral') => h('span', { class: cx('pill', `pill--${tone}`) }, text);

export const iconButton = (label, icon, onClick, extraClass) =>
  h('button', { type: 'button', class: cx('icon-btn', extraClass), 'aria-label': label, title: label, onClick }, icon);

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
