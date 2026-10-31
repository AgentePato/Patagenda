// Perfil elegido en este dispositivo. Si el navegador bloquea el
// almacenamiento, se recuerda solo mientras la pestaña esté abierta.
const KEY = 'patagenda-profile';
let memory = null;

export const session = {
  get() {
    try { return localStorage.getItem(KEY) ?? memory; } catch { return memory; }
  },
  set(profileId) {
    memory = profileId;
    try { localStorage.setItem(KEY, profileId); } catch { /* solo en memoria */ }
  },
  clear() {
    memory = null;
    try { localStorage.removeItem(KEY); } catch { /* nada que borrar */ }
  },
};
