// Buscador de sitios. Con clave de Google usa Google Places (nombres y
// direcciones exactos de Google Maps); sin clave, OpenStreetMap (Photon).
// Todos los resultados tienen la misma forma:
//   { place_id, name, address, lat, lng, maps_url }

const googleMapsLink = (name, address, googlePlaceId) => {
  const query = encodeURIComponent([name, address].filter(Boolean).join(', '));
  const id = googlePlaceId ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : '';
  return `https://www.google.com/maps/search/?api=1&query=${query}${id}`;
};

async function searchGoogle(query, { googleMapsApiKey, searchArea }) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsApiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'es',
      regionCode: 'ES',
      pageSize: 8,
      ...(searchArea && {
        locationBias: { circle: { center: { latitude: searchArea.lat, longitude: searchArea.lng }, radius: searchArea.radius } },
      }),
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(`Google Maps no responde (${detail?.error?.status ?? res.status}). Revisa la clave.`);
  }
  const data = await res.json();
  return (data.places ?? []).map((p) => ({
    place_id: `google:${p.id}`,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    maps_url: p.googleMapsUri ?? googleMapsLink(p.displayName?.text, p.formattedAddress, p.id),
  }));
}

async function searchOpenStreetMap(query, { searchArea }) {
  const params = new URLSearchParams({ q: query, limit: '8' });
  if (searchArea) {
    params.set('lat', searchArea.lat);
    params.set('lon', searchArea.lng);
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`);
  if (!res.ok) throw new Error('El buscador de mapas no responde. Inténtalo en un rato.');
  const data = await res.json();
  return data.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties;
      const street = [p.street, p.housenumber].filter(Boolean).join(' ');
      const address = [street, p.city ?? p.town ?? p.village, p.country].filter(Boolean).join(', ');
      const [lng, lat] = f.geometry.coordinates;
      return {
        place_id: `osm:${p.osm_type}${p.osm_id}`,
        name: p.name,
        address,
        lat,
        lng,
        maps_url: googleMapsLink(p.name, address),
      };
    });
}

export function createPlaceSearch(config) {
  const useGoogle = Boolean(config.googleMapsApiKey);
  return {
    provider: useGoogle ? 'Google Maps' : 'OpenStreetMap',
    async search(query) {
      const q = query.trim();
      if (q.length < 2) return [];
      try {
        return await (useGoogle ? searchGoogle(q, config) : searchOpenStreetMap(q, config));
      } catch (e) {
        if (e instanceof TypeError) throw new Error('No hay conexión con el buscador de mapas.');
        throw e;
      }
    },
  };
}
