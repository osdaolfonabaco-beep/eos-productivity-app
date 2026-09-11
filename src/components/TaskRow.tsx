import { useState } from 'react'
import type { Task } from '../data'

/** `2026-09-05` → `vie 5`. Fecha corta para las pastillas. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    weekday: 'short',
    day: 'numeric',
  })
}

interface TaskRowProps {
  task: Task
  onToggle: () => void
  /** Si se pasa, la fila permite editar texto y fecha en línea. */
  onSaveEdit?: (patch: { text: string; date: string | null }) => void
  /** Si se pasa, la fila permite archivar (con confirmación de dos toques). */
  onArchive?: () => void
  /** Mostrar la fecha de la tarea (atrasadas y próximas). */
  showDate?: boolean
}

type Mode = 'view' | 'edit' | 'confirm-archive'

const CHECKBOX_BASE =
  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border'

/**
 * Una tarea en una lista. Tocar el texto o la casilla la marca/desmarca.
 * Con `onSaveEdit` / `onArchive` aparecen las acciones (en Vida; en Hoy no).
 */
export default function TaskRow({
  task,
  onToggle,
  onSaveEdit,
  onArchive,
  showDate,
}: TaskRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [draftText, setDraftText] = useState(task.text)
  const [draftDate, setDraftDate] = useState(task.date ?? '')

  const editable = Boolean(onSaveEdit)

  function startEdit() {
    setDraftText(task.text)
    setDraftDate(task.date ?? '')
    setMode('edit')
  }

  function save() {
    const clean = draftText.trim()
    if (!clean || !onSaveEdit) return
    onSaveEdit({ text: clean, date: draftDate || null })
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          rows={2}
          autoFocus
          aria-label="Texto de la tarea"
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            aria-label="Fecha de la tarea"
            className="rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          {draftDate && (
            <button
              type="button"
              onClick={() => setDraftDate('')}
              className="text-sm font-medium text-gray-500"
            >
              Quitar fecha
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draftText.trim()}
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

  if (mode === 'confirm-archive') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
        <p className="text-sm text-gray-700">
          Se archivará: sale de la lista pero se conserva.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white"
          >
            Archivar
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

  const meta = (showDate && task.date) || editable

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={task.done}
        aria-label={task.done ? 'Marcar como no hecha' : 'Marcar como hecha'}
        className={`${CHECKBOX_BASE} ${
          task.done ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-400'
        }`}
      >
        {task.done && (
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggle}
          className={`block w-full break-words text-left ${
            task.done ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
        >
          {task.text}
        </button>

        {meta && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {showDate && task.date && (
              <span className="text-xs text-gray-500">{formatShortDate(task.date)}</span>
            )}
            {editable && (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-sm font-medium text-gray-500"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setMode('confirm-archive')}
                  className="text-sm font-medium text-gray-500"
                >
                  Archivar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
