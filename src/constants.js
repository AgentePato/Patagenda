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
  restaurant: { singular: 'sitio' },
  activity: { singular: 'plan', addTitle: 'Proponer un plan', placeholder: 'Ej. Ir al karaoke' },
};

// Datos iniciales (solo los usa el modo demo; en Supabase están en schema.sql).
export const DEFAULT_PROFILES = [
  { id: 'aroa', name: 'Aroa', emoji: '🦖', color: '#7cc576' },
  { id: 'carlo', name: 'Carlo', emoji: '🍺', color: '#f2b84b' },
  { id: 'diana', name: 'Diana', emoji: '🎯', color: '#e5606b' },
  { id: 'eva', name: 'Eva', emoji: '🖌️', color: '#a58bea' },
  { id: 'mario', name: 'Mario', emoji: '⚽', color: '#5aa9e6' },
  { id: 'marta', name: 'Marta', emoji: '🩺', color: '#ef7aa1' },
  { id: 'naiara', name: 'Naiara', emoji: '🐄', color: '#a7b0bb' },
  { id: 'raquel', name: 'Raquel', emoji: '🦆', color: '#f6c445' },
  { id: 'sofia', name: 'Sofía', emoji: '💻', color: '#4fbf9f' },
  { id: 'yaiza', name: 'Yaiza', emoji: '🎤', color: '#d17be0' },
  { id: 'ines', name: 'Inés', emoji: '🎮', color: '#6c8cf0' },
  { id: 'javi', name: 'Javi', emoji: '👟', color: '#f08a4b' },
  { id: 'alvaro', name: 'Álvaro', emoji: '🎾', color: '#b5d334' },
  { id: 'pablo', name: 'Pablo', emoji: '🍸', color: '#ff9f80' },
];
export const DEFAULT_ACTIVITIES = ['Ir a patinar', 'Pintar camisetas', 'Jugar a los bolos'];

export const DEFAULT_DINNER_TIME = '21:30';
