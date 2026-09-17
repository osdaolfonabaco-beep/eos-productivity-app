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
  /** Si la tarea está atrasada, su etiqueta ("ayer", "hace 3 días"). */
  overdueLabel?: string
}

type Mode = 'view' | 'edit' | 'move' | 'confirm-archive'

// El trazo va más grueso y con un contorno oscuro (drop-shadow, el
// equivalente real de text-shadow sobre un <path> de SVG) para que aguante
// sobre el color sólido --color-ind-hecho -- ver el mismo criterio en HabitRow.
const CHECK_GLYPH = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ filter: 'drop-shadow(var(--texto-glifo-hecho))' }}
  >
    <path d="M5 13l4 4L19 7" />
  </svg>
)

/**
 * Una tarea. Tocar el texto o la casilla la marca/desmarca; "Editar" cambia
 * el texto en línea, "Mover" (si se pasa `onMove`) cambia el día, y
 * "Archivar" pide confirmación de dos toques. Estas tres viven detrás del
 * menú "⋯" de la fila.
 */
export default function TaskRow({
  task,
  onToggle,
  onSaveText,
  onArchive,
  onMove,
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
          className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
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
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
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
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
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

  // La franja izquierda de 3px: atrasada (fallado) manda sobre hecha
  // (hecho), y una tarea de hoy sin marcar queda transparente. Mismo
  // ancho siempre, para que las filas no se desalineen entre sí.
  const stripe = overdueLabel
    ? 'border-l-fallado'
    : task.done
      ? 'border-l-hecho'
      : 'border-l-transparent'
  // El lavado de fondo solo acompaña a "hecho": una atrasada ya lleva su
  // propia franja roja, y las dos lavadas juntas se pisarían.
  const wash =
    task.done && !overdueLabel
      ? { background: 'linear-gradient(90deg, var(--color-hecho-lavado), transparent 42%)' }
      : undefined
  return (
    <div
      className={`border-l-[3px] transition-colors duration-[var(--dur-estado)] ease-salida ${stripe}`}
      style={wash}
    >
      <div className="flex min-h-11 items-center gap-3 py-2 pl-3 pr-1">
        {/*
         * key={task.done}: remonta el botón en cada toggle para que
         * --animate-salto-indicador se dispare de nuevo, mismo mecanismo
         * que key={status} en el badge de HabitRow.
         */}
        <button
          key={String(task.done)}
          type="button"
          onClick={onToggle}
          aria-pressed={task.done}
          aria-label={task.done ? 'Marcar como no hecha' : 'Marcar como hecha'}
          className={`flex h-5 w-5 shrink-0 animate-salto-indicador items-center justify-center rounded-[7px] border transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${
            task.done
              ? 'border-transparent bg-ind-hecho text-tarjeta shadow-[var(--sombra-ind-hecho)] active:shadow-[var(--sombra-ind-hecho-toque)]'
              : 'border-[var(--color-campo-borde)] bg-[var(--color-campo)] shadow-[var(--sombra-hundida)] active:bg-separador'
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
        <div className="flex gap-2 border-y-[0.5px] border-separador bg-[var(--color-menu-fondo)] px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              startEdit()
            }}
            className="rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
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
              className="rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
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
            className="rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
          >
            Archivar
          </button>
        </div>
      )}
    </div>
  )
}
