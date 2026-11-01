import { config } from './config.js';
import { createBackend } from './api/index.js';
import { createPlaceSearch } from './api/places.js';
import { createStore } from './store.js';
import { session } from './session.js';
import { madridToday, monthStartOf, weekStartOf } from './logic/dates.js';
import { h, cx, replaceContent } from './ui/dom.js';
import { avatar } from './ui/components.js';
import { renderHomeView } from './views/homeView.js';
import { renderDinnerView } from './views/dinnerView.js';
import { renderMonthView } from './views/monthView.js';
import { renderHistoryView } from './views/historyView.js';

const root = document.getElementById('app');

// Cada sección es una página aparte: #/, #/cena, #/plan, #/historico
const ROUTES = {
  '': renderHomeView,
  cena: renderDinnerView,
  plan: renderMonthView,
  historico: renderHistoryView,
};

const LIVE_LABELS = {
  live: 'En directo',
  connecting: 'Conectando…',
  offline: 'Reconectando…',
  demo: 'Modo demo',
};

// Estado de la interfaz que no se guarda en el servidor.
const ui = {
  editing: { restaurant: false, activity: false },
  openDetails: new Set(),
  historyYear: null,
  live: 'connecting',
  lastRoute: null,
};

const isDemo = new URLSearchParams(location.search).has('demo');
const placeSearch = createPlaceSearch(config);
let store;
let backend;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '');
  return name in ROUTES ? name : '';
}

// ---------------------------------------------------------------- pantallas
function renderLoading() {
  replaceContent(root, h('div', { class: 'screen-center' },
    h('div', { class: 'loader', 'aria-hidden': 'true' }, '🦆'),
    h('p', { class: 'muted' }, 'Cargando vuestros planes…')));
}

function renderError(error) {
  const notConfigured = /get_state|function|schema|column/i.test(error.message);
  replaceContent(root, h('div', { class: 'screen-center' },
    h('div', { class: 'loader loader--still', 'aria-hidden': 'true' }, '😿'),
    h('h2', {}, 'No hemos podido cargar los datos'),
    h('p', { class: 'muted' }, error.message),
    notConfigured && h('p', { class: 'muted' }, '¿Has ejecutado la última versión de supabase/schema.sql en Supabase?'),
    h('button', { type: 'button', class: 'btn btn--primary', onClick: start }, 'Reintentar')));
}

function renderPicker(state) {
  replaceContent(root, h('div', { class: 'picker' },
    h('div', { class: 'picker__logo', 'aria-hidden': 'true' }, '🦆'),
    h('h1', { class: 'picker__brand' }, 'Patagenda'),
    h('p', { class: 'picker__question' }, '¿Quién eres?'),
    h('div', { class: 'picker__grid' }, state.profiles.map((p) => h('button', {
      type: 'button',
      class: 'profile-card',
      style: { '--c': p.color },
      onClick: () => { session.set(p.id); location.hash = '#/'; render(); window.scrollTo(0, 0); },
    }, avatar(p, { size: 'lg' }), h('span', { class: 'profile-card__name' }, p.name)))),
    h('p', { class: 'picker__note' }, 'Tus votos se guardan con tu nombre. Puedes cambiar de perfil cuando quieras.')));
}

function topbar(me) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'topbar__brand', href: '#/' }, h('span', { 'aria-hidden': 'true' }, '🦆'), 'Patagenda'),
    h('span', { class: cx('live', `live--${ui.live}`), title: LIVE_LABELS[ui.live] },
      h('span', { class: 'live__dot', 'aria-hidden': 'true' }), LIVE_LABELS[ui.live]),
    h('button', {
      type: 'button',
      class: 'me-chip',
      title: 'Cambiar de perfil',
      onClick: () => { session.clear(); render(); },
    }, avatar(me), h('span', { class: 'me-chip__text' }, h('strong', {}, me.name), h('small', {}, 'Cambiar'))));
}

function render() {
  const state = store?.state;
  if (!state) return;

  const me = state.profiles.find((p) => p.id === session.get());
  if (!me) { renderPicker(state); return; }

  const profilesById = Object.fromEntries(state.profiles.map((p) => [p.id, p]));
  const ctx = { state, me, store, ui, profilesById, placeSearch, rerender: render };
  const route = currentRoute();
  const entering = ui.lastRoute !== route;
  ui.lastRoute = route;

  replaceContent(root,
    topbar(me),
    backend.mode === 'demo' && h('p', { class: 'demo-banner' },
      'Modo demo: los votos solo se guardan en este navegador y no afectan a los datos reales.'),
    h('main', { class: cx('main', entering && 'main--enter') }, ROUTES[route](ctx)),
    h('footer', { class: 'footer' }, 'Hecho con 💖 para el grupo'));
}

// ---------------------------------------------------------------- arranque
let unsubscribe = null;
let started = false;

async function start() {
  renderLoading();
  try {
    backend ??= await createBackend(config, { demo: isDemo });
    store ??= createStore(backend);
    await store.refresh();
  } catch (error) {
    renderError(error);
    return;
  }
  render();

  if (started) return;
  started = true;
  store.subscribe(render);
  unsubscribe = backend.subscribe(
    () => store.scheduleRefresh(),
    (status) => {
      const wasOffline = ui.live === 'offline';
      ui.live = status;
      if (status === 'live' && wasOffline) store.scheduleRefresh(0); // recupera lo que se perdió
      render();
    },
  );

  window.addEventListener('hashchange', () => {
    // El enlace "Ver plan definitivo" usa un ancla dentro de la página, no es una ruta.
    if (location.hash === '#plan-definitivo') return;
    render();
    window.scrollTo({ top: 0 });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) store.scheduleRefresh(0); });
  window.addEventListener('online', () => store.scheduleRefresh(0));
  window.addEventListener('pagehide', () => unsubscribe?.());

  // Si cambia la semana o el mes con la web abierta, se vuelve a pedir el
  // estado: el servidor ya devuelve las encuestas vacías del nuevo periodo.
  setInterval(() => {
    const s = store.state;
    if (!s) return;
    const today = madridToday();
    if (weekStartOf(today) !== s.week_start || monthStartOf(today) !== s.month_start || today !== s.today) {
      store.scheduleRefresh(0);
    }
  }, 30_000);

  // Red de seguridad por si el tiempo real se corta sin avisar.
  setInterval(() => { if (!document.hidden) store.scheduleRefresh(0); }, 5 * 60_000);
}

start();
