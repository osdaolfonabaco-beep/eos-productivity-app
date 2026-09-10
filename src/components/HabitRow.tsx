import type { EntryStatus } from '../data'

interface HabitRowProps {
  name: string
  status: EntryStatus
  /** Avanza el hábito al siguiente estado del ciclo. */
  onCycle: () => void
}

/**
 * Todo lo que cambia de un estado a otro, en un solo sitio.
 * `nextLabel` es solo para el texto accesible ("tocar para cambiar a ...").
 */
const STATUS_META: Record<
  EntryStatus,
  { label: string; nextLabel: string; row: string; badge: string; word: string }
> = {
  unanswered: {
    label: 'Sin responder',
    nextLabel: 'hecho',
    row: 'border-dashed border-gray-300 bg-white',
    badge: 'border-dashed border-gray-400 text-transparent',
    word: 'text-gray-400',
  },
  done: {
    label: 'Hecho',
    nextLabel: 'no hecho',
    row: 'border-solid border-green-300 bg-green-50',
    badge: 'border-solid border-green-600 bg-green-600 text-white',
    word: 'text-green-700',
  },
  'not-done': {
    label: 'No hecho',
    nextLabel: 'sin responder',
    row: 'border-solid border-rose-300 bg-rose-50',
    badge: 'border-solid border-rose-600 bg-rose-600 text-white',
    word: 'text-rose-700',
  },
}

/**
 * El glifo dentro del disco. La forma es lo que distingue los estados sin
 * depender del color: check para "hecho", cruz para "no hecho", nada (anillo
 * punteado vacío) para "sin responder".
 */
function Glyph({ status }: { status: EntryStatus }) {
  if (status === 'done') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
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
        className="h-5 w-5"
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
 * Un hábito en la vista del día, como un único botón de ancho completo.
 * Presentacional: recibe el estado ya resuelto y avisa del toque con `onCycle`;
 * no sabe nada del módulo de datos.
 */
export default function HabitRow({ name, status, onCycle }: HabitRowProps) {
  const meta = STATUS_META[status]

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`${name}, ${meta.label.toLowerCase()}. Tocar para cambiar a ${meta.nextLabel}.`}
      className={`flex min-h-16 w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-opacity active:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 ${meta.row}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${meta.badge}`}
        aria-hidden="true"
      >
        <Glyph status={status} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-lg text-gray-900">{name}</span>
        <span className={`text-sm ${meta.word}`}>{meta.label}</span>
      </span>
    </button>
  )
}
