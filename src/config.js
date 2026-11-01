// Configuración de Supabase (Project Settings → API).
// La "anon key" es pública por diseño: la seguridad la ponen las políticas
// y funciones de supabase/schema.sql. Si se dejan vacías, la web arranca en
// modo demo (los datos se guardan solo en este navegador).
export const config = {
  supabaseUrl: 'https://zhycdwcmvgfgxpyctlxj.supabase.co',
  supabaseAnonKey: 'sb_publishable_Zd4Qx42fflvZ2_vF8QcXow_P96r3JcQ',

  // Clave de Google Maps Platform con "Places API (New)" activada y
  // restringida a tu web (ver README). Si está vacía, el buscador de sitios
  // usa OpenStreetMap, que es gratis pero tiene menos locales.
  googleMapsApiKey: '',

  // Zona donde buscar primero los sitios (latitud, longitud, radio en metros).
  searchArea: { lat: 40.4168, lng: -3.7038, radius: 30000 },
};
