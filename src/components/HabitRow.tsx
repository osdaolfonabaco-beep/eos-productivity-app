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
 *
 * `stripe` es el color de la franja izquierda de 3px; su ancho es siempre
 * el mismo (se fija aparte, en el botón) para que las filas nunca queden
 * desalineadas entre sí, aunque el color sea transparente.
 */
const STATUS_META: Record<
  EntryStatus,
  { label: string; nextLabel: string; stripe: string; badge: string; name: string }
> = {
  unanswered: {
    label: 'Sin responder',
    nextLabel: 'hecho',
    stripe: 'border-l-transparent',
    badge: 'border-borde bg-transparent',
    name: 'text-texto-cuerpo',
  },
  done: {
    label: 'Hecho',
    nextLabel: 'no hecho',
    stripe: 'border-l-hecho',
    badge: 'border-hecho bg-hecho text-white',
    name: 'text-texto-apagado line-through',
  },
  'not-done': {
    label: 'No hecho',
    nextLabel: 'sin responder',
    stripe: 'border-l-fallado',
    badge: 'border-fallado bg-fallado text-white',
    name: 'text-texto-cuerpo',
  },
}

/**
 * El glifo dentro del disco. La forma distingue los estados sin depender del
 * color: check para "hecho", cruz para "no hecho", nada (anillo vacío) para
 * "sin responder".
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
 * Un hábito en la pantalla Hoy: una fila de la lista de hábitos, glifo +
 * nombre, sin la palabra de estado. Toda la fila es el botón; el área de
 * toque se mantiene cómoda aunque el relleno visual sea más bajo (min-h-11
 * = 44px, el mínimo accesible).
 */
export default function HabitRow({ name, status, onCycle }: HabitRowProps) {
  const meta = STATUS_META[status]

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`${name}, ${meta.label.toLowerCase()}. Tocar para cambiar a ${meta.nextLabel}.`}
      className={`flex min-h-11 w-full items-center gap-3 border-l-[3px] py-3 pl-4 pr-4 text-left active:scale-[0.985] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${meta.stripe}`}
      style={{
        // Dos duraciones en la misma fila: el hundimiento al tocar (transform,
        // background-color) responde casi al instante; el color de la franja
        // izquierda, que refleja el estado, usa la transición más pausada.
        transition:
          'transform var(--dur-toque) var(--ease-toque), ' +
          'background-color var(--dur-toque) var(--ease-toque), ' +
          'border-color var(--dur-estado) var(--ease-salida)',
      }}
    >
      <span
        key={status}
        className={`flex h-6 w-6 shrink-0 animate-entrada-indicador items-center justify-center rounded-full border-2 ${meta.badge}`}
        aria-hidden="true"
      >
        <Glyph status={status} />
      </span>
      <span
        className={`min-w-0 flex-1 break-words text-contenido transition-colors duration-[var(--dur-estado)] ease-salida ${meta.name}`}
      >
        {name}
      </span>
    </button>
  )
}
