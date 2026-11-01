// Buscador de sitios en el mapa para añadirlos a la encuesta de la cena.

import { h } from '../ui/dom.js';
import { openModal, toast } from '../ui/feedback.js';

const SEARCH_DELAY_MS = 450;

export function openPlaceSearch(ctx) {
  const { store, placeSearch } = ctx;
  let timer = null;
  let seq = 0;

  const input = h('input', {
    class: 'input', type: 'search', placeholder: 'Ej. La Tagliatella Gran Vía', autocomplete: 'off',
    'aria-label': 'Buscar un sitio',
  });
  const status = h('p', { class: 'place-search__status muted' }, 'Escribe el nombre del sitio y elige el correcto.');
  const results = h('ul', { class: 'place-results' });

  async function run() {
    const query = input.value;
    const mine = ++seq;
    if (query.trim().length < 3) {
      results.replaceChildren();
      status.textContent = 'Escribe al menos 3 letras.';
      return;
    }
    status.textContent = 'Buscando…';
    try {
      const places = await placeSearch.search(query);
      if (mine !== seq) return; // llegó otra búsqueda más reciente
      status.textContent = places.length ? '' : 'No hemos encontrado nada. Prueba a añadir la ciudad o la calle.';
      results.replaceChildren(...places.map(resultItem));
    } catch (e) {
      if (mine === seq) status.textContent = e.message;
    }
  }

  function resultItem(place) {
    const already = store.state.restaurants.some((r) => r.place_id === place.place_id);
    const button = h('button', {
      type: 'button',
      class: 'place-result',
      disabled: already,
      onClick: async () => {
        button.disabled = true;
        try {
          await store.addPlace(place);
          toast(`«${place.name}» añadido a la lista 📍`, 'success');
          modal.close();
        } catch (e) {
          toast(e.message, 'error');
          button.disabled = false;
        }
      },
    },
    h('span', { class: 'place-result__text' },
      h('strong', {}, place.name),
      place.address && h('small', {}, place.address)),
    h('span', { class: 'place-result__action' }, already ? 'Ya está' : 'Añadir'));
    return h('li', {}, button);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, SEARCH_DELAY_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); run(); }
  });

  const modal = openModal({
    title: '📍 Añadir un sitio',
    body: h('div', { class: 'place-search' },
      input, status, results,
      h('p', { class: 'place-search__provider' }, `Resultados de ${placeSearch.provider}`)),
    actions: [h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => modal.close() }, 'Cerrar')],
  });
  setTimeout(() => input.focus(), 60);
}
