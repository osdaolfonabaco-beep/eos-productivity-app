import type { EntryStatus } from '../data'

interface HabitRowProps {
  name: string
  status: EntryStatus
  /** Avanza el hábito al siguiente estado del ciclo. */
  onCycle: () => void
}

/**
 * Todo lo que cambia de un estado a otro, en un solo sitio.
 * `label` / `nextLabel` son solo para el texto accesible; en pantalla el
 * estado lo dice la forma del glifo (y el color, que solo refuerza).
 */
const STATUS_META: Record<
  EntryStatus,
  { label: string; nextLabel: string; row: string; badge: string }
> = {
  unanswered: {
    label: 'Sin responder',
    nextLabel: 'hecho',
    row: 'border-dashed border-gray-300 bg-white',
    badge: 'border-dashed border-gray-400 text-transparent',
  },
  done: {
    label: 'Hecho',
    nextLabel: 'no hecho',
    row: 'border-solid border-green-300 bg-green-50',
    badge: 'border-solid border-green-600 bg-green-600 text-white',
  },
  'not-done': {
    label: 'No hecho',
    nextLabel: 'sin responder',
    row: 'border-solid border-rose-300 bg-rose-50',
    badge: 'border-solid border-rose-600 bg-rose-600 text-white',
  },
}

/**
 * El glifo dentro del disco. La forma distingue los estados sin depender del
 * color: check para "hecho", cruz para "no hecho", nada (anillo punteado
 * vacío) para "sin responder".
 */
function Glyph({ status }: { status: EntryStatus }) {
  if (status === 'done') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
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
  }
  if (status === 'not-done') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    )
  }
  return null
}

/**
 * Un hábito en la pantalla Hoy: una sola línea, glifo + nombre, sin la palabra
 * de estado. Toda la fila es el botón; el área de toque sigue siendo cómoda.
 */
export default function HabitRow({ name, status, onCycle }: HabitRowProps) {
  const meta = STATUS_META[status]

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`${name}, ${meta.label.toLowerCase()}. Tocar para cambiar a ${meta.nextLabel}.`}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-opacity active:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 ${meta.row}`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${meta.badge}`}
        aria-hidden="true"
      >
        <Glyph status={status} />
      </span>
      <span className="min-w-0 flex-1 break-words text-base font-medium text-gray-900">
        {name}
      </span>
    </button>
  )
}
