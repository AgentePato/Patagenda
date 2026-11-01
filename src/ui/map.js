// Mapa de sitios con Leaflet + teselas de CARTO (gratis, sin clave). Leaflet
// se carga solo cuando hace falta un mapa.

import { h } from './dom.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
let leafletPromise = null;

function loadLeaflet() {
  leafletPromise ??= new Promise((resolve, reject) => {
    document.head.append(h('link', { rel: 'stylesheet', href: `${LEAFLET}.css` }));
    const script = h('script', { src: `${LEAFLET}.js` });
    script.addEventListener('load', () => resolve(window.L));
    script.addEventListener('error', () => { leafletPromise = null; reject(new Error('No se ha podido cargar el mapa')); });
    document.head.append(script);
  });
  return leafletPromise;
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// El mapa se reutiliza mientras no cambien los sitios, para que no
// parpadee cada vez que llega un voto en tiempo real.
let cached = { key: null, el: null };

/** @param places [{ name, lat, lng, count, maps_url }] */
export function placesMap(places) {
  const located = places.filter((p) => p.lat != null && p.lng != null);
  if (!located.length) return h('p', { class: 'empty' }, 'Cuando confirméis cenas, aparecerán aquí en el mapa.');

  const key = JSON.stringify(located.map((p) => [p.name, p.lat, p.lng, p.count]));
  if (cached.key === key && cached.el) {
    setTimeout(() => cached.el._leaflet?.invalidateSize(), 0);
    return cached.el;
  }

  const el = h('div', { class: 'map', role: 'img', 'aria-label': `Mapa con ${located.length} sitios` });
  cached = { key, el };

  loadLeaflet().then((L) => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
    el._leaflet = map;
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    const max = Math.max(...located.map((p) => p.count));
    const color = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#e5608e';
    for (const p of located) {
      L.circleMarker([p.lat, p.lng], {
        radius: 7 + (max > 1 ? ((p.count - 1) / (max - 1)) * 11 : 0),
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.85,
      })
        .bindTooltip(`${escapeHtml(p.name)} · ${p.count} ${p.count === 1 ? 'vez' : 'veces'}`)
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${p.count} ${p.count === 1 ? 'vez' : 'veces'}`
          + (p.maps_url ? `<br><a href="${escapeHtml(p.maps_url)}" target="_blank" rel="noopener">Abrir en Google Maps</a>` : ''))
        .addTo(map);
    }
    const bounds = L.latLngBounds(located.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }).catch((e) => { el.replaceChildren(h('p', { class: 'empty' }, e.message)); });

  return el;
}
