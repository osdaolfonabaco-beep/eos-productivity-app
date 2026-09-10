import { useState } from 'react'

interface HabitManageRowProps {
  name: string
  /** Renombra el hábito. Ya viene recortado y no vacío. */
  onRename: (name: string) => void
  /** Archiva el hábito (el botón "Eliminar"). */
  onDelete: () => void
}

/** Los tres modos en los que puede estar una fila. */
type Mode = 'view' | 'edit' | 'confirm-delete'

/**
 * Una fila de la pantalla "Hábitos".
 *
 * Guarda su propio modo: normal (nombre + Editar + Eliminar), edición en línea
 * (campo + Guardar + Cancelar) y confirmación de borrado (aviso + Eliminar +
 * Cancelar). No conoce el módulo de datos: avisa con `onRename` / `onDelete`.
 */
export default function HabitManageRow({ name, onRename, onDelete }: HabitManageRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(name)

  function startEdit() {
    setDraft(name)
    setMode('edit')
  }

  function save() {
    const clean = draft.trim()
    if (!clean) return
    onRename(clean)
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          aria-label="Nuevo nombre del hábito"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-delete') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
        <p className="break-words text-lg font-medium text-gray-900">{name}</p>
        <p className="mt-1 text-sm text-gray-600">Se archivará. El historial se conserva.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <span className="min-w-0 flex-1 break-words text-lg font-medium text-gray-900">{name}</span>
      <button
        type="button"
        onClick={startEdit}
        className="shrink-0 rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium text-gray-700"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={() => setMode('confirm-delete')}
        className="shrink-0 rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium text-gray-700"
      >
        Eliminar
      </button>
    </div>
  )
}
