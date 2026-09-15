import { useState } from 'react'
import { todayISO, type Task } from '../data'
import DayPicker from './DayPicker'

interface TaskRowProps {
  task: Task
  onToggle: () => void
  onSaveText: (text: string) => void
  onArchive: () => void
  /** Solo si se pasa: mueve la tarea a otro día (o a "hoy", con `null`). Solo Plan la pasa; por eso "Mover" solo aparece ahí. */
  onMove?: (plannedFor: string | null) => void
  /**
   * `'row'` es la fila compacta del patrón (casilla + texto, con Editar/
   * Mover/Archivar ocultos tras el menú "⋯") — la usan Hoy y Plan.
   * `'card'` es el diseño anterior, sin ningún uso ahora mismo; se deja tal
   * cual (código muerto, a propósito) hasta un paso de limpieza aparte.
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
 * Una tarea. Tocar el texto o la casilla la marca/desmarca; "Editar" cambia
 * el texto en línea, "Mover" (si se pasa `onMove`) cambia el día, y
 * "Archivar" pide confirmación de dos toques. Estas tres viven detrás del
 * menú "⋯" de la fila (`variant="row"`, usado por Hoy y Plan).
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
      <div className="px-3 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          aria-label="Texto de la tarea"
          className="w-full resize-y rounded-campo border border-borde px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-campo bg-texto px-4 py-2 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
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
      <div className="px-3 py-3">
        <p className="mb-2 text-sm text-texto-apagado">Mover a:</p>
        <div className="flex gap-2">
          <DayPicker value={moveTo} onChange={setMoveTo} today={today} label="Mover la tarea a" />
          <button
            type="button"
            onClick={() => {
              onMove(moveTo)
              setMode('view')
            }}
            className="rounded-campo bg-texto px-4 py-2 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)]"
          >
            Mover
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-archive') {
    return (
      <div className="px-3 py-3">
        <p className="text-sm text-texto-apagado">
          Se archivará: sale de la lista pero se conserva.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            className="rounded-campo bg-acento px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-acento-toque)]"
          >
            Archivar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
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
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${
              task.done
                ? 'border-texto bg-texto text-tarjeta active:bg-[var(--color-texto-toque)]'
                : 'border-texto-tenue active:bg-separador'
            }`}
          >
            {task.done && CHECK_GLYPH}
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 break-words rounded-campo text-left transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
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
              className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
            >
              Editar
            </button>
            {onMove && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setMoveTo(task.plannedFor)
                  setMode('move')
                }}
                className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
              >
                Mover
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setMode('confirm-archive')
              }}
              className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
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
