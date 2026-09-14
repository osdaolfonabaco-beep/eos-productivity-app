import { useState } from 'react'
import { todayISO, type Task } from '../data'
import DayPicker from './DayPicker'

interface TaskRowProps {
  task: Task
  onToggle: () => void
  onSaveText: (text: string) => void
  onArchive: () => void
  /** Solo en la vista de planificación: mueve la tarea a otro día (o a "hoy", con `null`). */
  onMove?: (plannedFor: string | null) => void
  /**
   * `'card'` (por defecto) es la fila-tarjeta de siempre, con Editar/Mover/
   * Archivar siempre visibles — la usa Plan. `'row'` es la fila compacta de
   * la pantalla Hoy: casilla + texto, y Editar/Archivar ocultos tras el menú
   * "⋯". Cambiar esto no debe alterar nada quien no pasa `variant`.
   */
  variant?: 'card' | 'row'
  /** Solo `variant="row"`: si la tarea está atrasada, su etiqueta ("ayer", "hace 3 días"). */
  overdueLabel?: string
}

type Mode = 'view' | 'edit' | 'move' | 'confirm-archive'

const CHECKBOX_BASE =
  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border'

const CHECK_GLYPH = (
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
)

/**
 * Una tarea, en dos presentaciones (`variant`). Tocar el texto o la casilla
 * la marca/desmarca en ambas; "Editar" cambia el texto en línea y "Archivar"
 * pide confirmación de dos toques. En `variant="row"` (Hoy), Editar/Archivar
 * están detrás del menú "⋯" de la fila; en `variant="card"` (Plan, y el
 * valor por defecto) están siempre a la vista, como siempre.
 */
export default function TaskRow({
  task,
  onToggle,
  onSaveText,
  onArchive,
  onMove,
  variant = 'card',
  overdueLabel,
}: TaskRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(task.text)
  const [moveTo, setMoveTo] = useState<string | null>(task.plannedFor)
  const [menuOpen, setMenuOpen] = useState(false)

  function startEdit() {
    setDraft(task.text)
    setMode('edit')
  }

  function save() {
    const clean = draft.trim()
    if (!clean) return
    onSaveText(clean)
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          aria-label="Texto de la tarea"
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
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

  if (mode === 'move' && onMove) {
    const today = todayISO()
    return (
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <p className="mb-2 text-sm text-gray-700">Mover a:</p>
        <div className="flex gap-2">
          <DayPicker value={moveTo} onChange={setMoveTo} today={today} label="Mover la tarea a" />
          <button
            type="button"
            onClick={() => {
              onMove(moveTo)
              setMode('view')
            }}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Mover
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
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

  if (variant === 'row') {
    // La franja izquierda de 3px marca las atrasadas (color fallado) frente a
    // las de hoy (transparente), igual que el ciclo de hábitos: mismo ancho
    // siempre, para que las filas no se desalineen entre sí.
    const stripe = overdueLabel ? 'border-l-fallado' : 'border-l-transparent'
    return (
      <div className={`border-l-[3px] ${stripe}`}>
        <div className="flex min-h-11 items-center gap-3 py-2 pl-3 pr-1">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={task.done}
            aria-label={task.done ? 'Marcar como no hecha' : 'Marcar como hecha'}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${
              task.done ? 'border-texto bg-texto text-tarjeta' : 'border-texto-tenue'
            }`}
          >
            {task.done && CHECK_GLYPH}
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 break-words text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <span className={task.done ? 'text-texto-apagado line-through' : 'text-texto-cuerpo'}>
              {task.text}
            </span>
            {overdueLabel && <span className="ml-2 text-meta text-fallado">{overdueLabel}</span>}
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Más acciones para esta tarea"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-texto-tenue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            ⋯
          </button>
        </div>

        {menuOpen && (
          <div className="flex gap-4 pb-2 pl-3">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                startEdit()
              }}
              className="text-sm font-medium text-texto-apagado"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setMode('confirm-archive')
              }}
              className="text-sm font-medium text-texto-apagado"
            >
              Archivar
            </button>
          </div>
        )}
      </div>
    )
  }

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
        {task.done && CHECK_GLYPH}
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
        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={startEdit}
            className="text-sm font-medium text-gray-500"
          >
            Editar
          </button>
          {onMove && (
            <button
              type="button"
              onClick={() => {
                setMoveTo(task.plannedFor)
                setMode('move')
              }}
              className="text-sm font-medium text-gray-500"
            >
              Mover
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode('confirm-archive')}
            className="text-sm font-medium text-gray-500"
          >
            Archivar
          </button>
        </div>
      </div>
    </div>
  )
}
