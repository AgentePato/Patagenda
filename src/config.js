// Configuración de Supabase (Project Settings → API).
// La "anon key" es pública por diseño: la seguridad la ponen las políticas
// y funciones de supabase/schema.sql. Si se dejan vacías, la web arranca en
// modo demo (los datos se guardan solo en este navegador).
export const config = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
