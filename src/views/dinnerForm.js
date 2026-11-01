// Formulario "Añadir cena definitiva": día de esta semana, hora y sitio.

import { DEFAULT_DINNER_TIME } from '../constants.js';
import { formatDayName } from '../logic/dates.js';
import { weekDates } from '../logic/events.js';
import { h } from '../ui/dom.js';
import { openModal, toast } from '../ui/feedback.js';

/**
 * @param defaults { date, restaurantId } valores propuestos (los que van ganando)
 * @param existing la cena ya guardada, si se está cambiando
 */
export function openDinnerForm(ctx, { defaults = {}, existing = null } = {}) {
  const { state, me, store } = ctx;
  if (!state.restaurants.length) {
    toast('Primero añade algún sitio a la lista de «¿Dónde cenamos?»', 'error');
    return;
  }

  const date = existing?.event_date ?? defaults.date;
  const restaurantId = existing?.restaurant_id ?? defaults.restaurantId ?? state.restaurants[0].id;

  const daySelect = h('select', { class: 'input', 'aria-label': 'Día' },
    weekDates(state.week_start).map((d) => h('option', { value: d, selected: d === date }, formatDayName(d))));
  const timeInput = h('input', {
    class: 'input', type: 'time', value: existing?.event_time ?? DEFAULT_DINNER_TIME, step: 300, 'aria-label': 'Hora',
  });
  const placeSelect = h('select', { class: 'input', 'aria-label': 'Sitio' },
    state.restaurants.map((r) => h('option', { value: r.id, selected: r.id === restaurantId }, r.name)));
  // Si la cena guardada era en un sitio que ya no está en la lista, lo avisamos.
  const missingPlace = existing && !state.restaurants.some((r) => r.id === existing.restaurant_id);

  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, existing ? 'Guardar cambios' : 'Confirmar cena');
  const cancel = h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => modal.close() }, 'Cancelar');

  const form = h('form', {
    class: 'form',
    novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      if (!/^\d{1,2}:\d{2}$/.test(timeInput.value)) { error.textContent = 'Elige una hora'; return; }
      submit.disabled = true;
      try {
        await store.setDinner(me.id, daySelect.value, timeInput.value, placeSelect.value);
        toast('¡Cena confirmada! 🎉', 'success');
        modal.close();
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
      }
    },
  },
  h('label', { class: 'form__label' }, 'Día', daySelect),
  h('label', { class: 'form__label' }, 'Hora', timeInput),
  h('label', { class: 'form__label' }, 'Sitio', placeSelect),
  missingPlace && h('p', { class: 'muted' }, `«${existing.title}» ya no está en la lista: elige otro sitio.`),
  h('p', { class: 'muted form__note' }, 'Al confirmar, a todas les saldrá un aviso para decir si van.'),
  error,
  h('div', { class: 'modal__actions' }, cancel, submit));

  const modal = openModal({ title: existing ? 'Cambiar la cena de esta semana' : 'Añadir cena definitiva', body: form });
}
