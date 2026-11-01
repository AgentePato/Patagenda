// Añadir, renombrar y borrar opciones (sitios para cenar y planes).
// Compartido por las dos secciones.

import { NAME_MAX_LENGTH, OPTION_KINDS } from '../constants.js';
import { h } from '../ui/dom.js';
import { iconButton } from '../ui/components.js';
import { confirmDialog, promptText, toast } from '../ui/feedback.js';

const listFor = (state, kind) => (kind === 'restaurant' ? state.restaurants : state.activities);

function assertUnique(state, kind, name, exceptId = null) {
  const lower = name.toLowerCase();
  if (listFor(state, kind).some((o) => o.id !== exceptId && o.name.toLowerCase() === lower)) {
    throw new Error('Ya existe una opción con ese nombre');
  }
  if (name.length > NAME_MAX_LENGTH) throw new Error(`Máximo ${NAME_MAX_LENGTH} caracteres`);
}

export function openAddOption(kind, { store }) {
  const meta = OPTION_KINDS[kind];
  promptText({
    title: meta.addTitle,
    label: `Nombre del ${meta.singular}`,
    placeholder: meta.placeholder,
    confirmText: 'Añadir',
    maxLength: NAME_MAX_LENGTH,
    onSubmit: async (name) => {
      assertUnique(store.state, kind, name);
      await store.addOption(kind, name);
      toast(`«${name}» añadido ✨`, 'success');
    },
  });
}

function openRename(kind, option, { store }) {
  const meta = OPTION_KINDS[kind];
  promptText({
    title: `Editar ${meta.singular}`,
    label: 'Nuevo nombre',
    initial: option.name,
    maxLength: NAME_MAX_LENGTH,
    onSubmit: async (name) => {
      if (name === option.name) return;
      assertUnique(store.state, kind, name, option.id);
      await store.renameOption(kind, option.id, name);
    },
  });
}

function openDelete(kind, option, { store }) {
  const meta = OPTION_KINDS[kind];
  confirmDialog({
    title: `¿Borrar «${option.name}»?`,
    message: `Se borrará este ${meta.singular} y también los votos que tenga. Las demás opciones no se tocan.`,
    onConfirm: async () => {
      await store.deleteOption(kind, option.id);
      toast(`«${option.name}» borrado`);
    },
  });
}

/** Botones ✏️ / 🗑 que aparecen en modo edición. */
export function optionTools(kind, option, ctx, { rename = true } = {}) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return h('span', { class: 'option-tools' },
    rename && iconButton('Editar nombre', '✏️', stop(() => openRename(kind, option, ctx))),
    iconButton('Borrar', '🗑', stop(() => openDelete(kind, option, ctx)), 'icon-btn--danger'));
}

/** Botón "Editar / Listo" de la cabecera de una tarjeta. */
export function editToggle(kind, ctx) {
  const editing = ctx.ui.editing[kind];
  return h('button', {
    type: 'button',
    class: `chip-btn${editing ? ' is-active' : ''}`,
    'aria-pressed': String(editing),
    onClick: () => { ctx.ui.editing[kind] = !editing; ctx.rerender(); },
  }, editing ? '✓ Listo' : '✏️ Editar');
}
