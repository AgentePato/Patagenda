import { h } from './dom.js';

// ---------------------------------------------------------------- toasts
let toastHost;

export function toast(message, tone = 'info') {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: `toast toast--${tone}` }, message);
  toastHost.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3200);
}

/** Ejecuta una acción y, si falla, avisa con un toast. */
export async function attempt(action) {
  try {
    await action();
  } catch (e) {
    toast(e.message || 'Algo ha fallado', 'error');
  }
}

// ---------------------------------------------------------------- modales
function openModal({ title, body, actions, onClose }) {
  const previousFocus = document.activeElement;
  const panel = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h3', { class: 'modal__title' }, title),
    body,
    actions && h('div', { class: 'modal__actions' }, actions));
  const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) close(); } }, panel);

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('is-leaving');
    overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
    previousFocus?.focus?.();
    onClose?.();
  }

  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return { panel, close };
}

/**
 * Pide un nombre. `onSubmit(valor)` puede lanzar un error: se muestra en
 * el propio formulario y el modal sigue abierto.
 */
export function promptText({ title, label, initial = '', placeholder = '', confirmText = 'Guardar', maxLength, onSubmit }) {
  const input = h('input', { class: 'input', type: 'text', value: initial, placeholder, maxlength: maxLength, autocomplete: 'off', 'aria-label': label });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, confirmText);
  const cancel = h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => modal.close() }, 'Cancelar');

  const form = h('form', {
    class: 'form',
    novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      const value = input.value.trim().replace(/\s+/g, ' ');
      if (!value) { error.textContent = 'Escribe un nombre'; input.focus(); return; }
      submit.disabled = true;
      submit.textContent = 'Guardando…';
      try {
        await onSubmit(value);
        modal.close();
      } catch (err) {
        error.textContent = err.message || 'No se ha podido guardar';
        submit.disabled = false;
        submit.textContent = confirmText;
      }
    },
  }, h('label', { class: 'form__label' }, label, input), error, h('div', { class: 'modal__actions' }, cancel, submit));

  const modal = openModal({ title, body: form });
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

export function confirmDialog({ title, message, confirmText = 'Borrar', onConfirm }) {
  const confirm = h('button', {
    type: 'button',
    class: 'btn btn--danger',
    onClick: async () => {
      confirm.disabled = true;
      try { await onConfirm(); } catch (e) { toast(e.message, 'error'); }
      modal.close();
    },
  }, confirmText);
  const cancel = h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => modal.close() }, 'Cancelar');
  const modal = openModal({ title, body: h('p', { class: 'modal__text' }, message), actions: [cancel, confirm] });
  setTimeout(() => cancel.focus(), 60);
}
