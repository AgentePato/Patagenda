export const SLOTS = [
  { id: 'manana', label: 'Mañana', emoji: '☀️' },
  { id: 'tarde', label: 'Tarde', emoji: '🌇' },
  { id: 'noche', label: 'Noche', emoji: '🌙' },
];

export const DINNER_DAYS = [
  { id: 'viernes', label: 'Viernes', emoji: '🥂' },
  { id: 'sabado', label: 'Sábado', emoji: '💃' },
];

export const RATINGS = [
  { score: 1, emoji: '😩', label: 'No me apetece nada' },
  { score: 2, emoji: '😕', label: 'Me apetece poco' },
  { score: 3, emoji: '😐', label: 'Me da igual' },
  { score: 4, emoji: '😊', label: 'Me apetece bastante' },
  { score: 5, emoji: '🤩', label: 'Me apetece muchísimo' },
];

// Mínimo de personas en una misma franja para dar el plan por decidido.
export const MIN_ATTENDEES = 2;

export const NAME_MAX_LENGTH = 60;

export const OPTION_KINDS = {
  restaurant: { singular: 'sitio', addTitle: 'Añadir un sitio para cenar', placeholder: 'Ej. La pizzería de la esquina' },
  activity: { singular: 'plan', addTitle: 'Proponer un plan', placeholder: 'Ej. Ir al karaoke' },
};

// Datos iniciales (solo los usa el modo demo; en Supabase están en schema.sql).
export const DEFAULT_PROFILES = [
  { id: 'raquel', name: 'Raquel', color: '#ef7aa1' },
  { id: 'marta', name: 'Marta', color: '#a58bea' },
  { id: 'diana', name: 'Diana', color: '#4fbf9f' },
];
export const DEFAULT_RESTAURANTS = ['Al fondo hay sitio', "McDonald's", 'Carrefour'];
export const DEFAULT_ACTIVITIES = ['Ir a patinar', 'Pintar camisetas', 'Jugar a los bolos'];
