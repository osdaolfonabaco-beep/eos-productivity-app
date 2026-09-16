import { useState, type KeyboardEvent } from 'react'
import type { EntryStatus } from '../data'

interface HabitRowProps {
  name: string
  status: EntryStatus
  /**
   * El estado al que se pasará con el próximo toque. Lo calcula quien nos
   * llama (mismo ciclo `NEXT` de TodayHabits): aquí no se duplica esa lógica,
   * solo se usa para pintar el destello del color correcto.
   */
  nextStatus: EntryStatus
  /** Avanza el hábito al siguiente estado del ciclo. */
  onCycle: () => void
}

/** El color de destello por estado siguiente. Neutro cuando el siguiente es "sin responder". */
const FLASH_COLOR: Record<EntryStatus, string> = {
  done: 'var(--color-hecho-destello)',
  'not-done': 'var(--color-fallado-destello)',
  unanswered: 'var(--color-neutro-destello)',
}

/**
 * Todo lo que cambia de un estado a otro, en un solo sitio.
 * `label` / `nextLabel` son solo para el texto accesible; en pantalla el
 * estado lo dice la forma del glifo (y el color, que solo refuerza).
 *
 * `stripe` es el color de la franja izquierda de 3px; su ancho es siempre
 * el mismo (se fija aparte, en el botón) para que las filas nunca queden
 * desalineadas entre sí, aunque el color sea transparente.
 *
 * `badge` lleva también el relieve del disco: hundido (hueco) cuando está
 * sin responder, y con su sombra de color cuando ya tiene un estado — con
 * la versión encogida de esa sombra para cuando la fila está `:active`
 * (el disco no tiene su propio `:active`, hereda el de la fila vía `group`).
 * `wash` es el lavado de fondo de la fila entera; `undefined` en "sin
 * responder", que no lleva.
 */
const STATUS_META: Record<
  EntryStatus,
  { label: string; nextLabel: string; stripe: string; badge: string; name: string; wash?: string }
> = {
  unanswered: {
    label: 'Sin responder',
    nextLabel: 'hecho',
    stripe: 'border-l-transparent',
    badge: 'border-[var(--color-campo-borde)] bg-[var(--color-campo)] shadow-[var(--sombra-hundida)]',
    name: 'text-texto-cuerpo',
  },
  done: {
    label: 'Hecho',
    nextLabel: 'no hecho',
    stripe: 'border-l-hecho',
    badge:
      'border-transparent bg-[image:var(--grad-ind-hecho)] text-white shadow-[var(--sombra-ind-hecho)] group-active:shadow-[var(--sombra-ind-hecho-toque)]',
    name: 'text-texto-apagado line-through',
    wash: 'linear-gradient(90deg, var(--color-hecho-lavado), transparent 42%)',
  },
  'not-done': {
    label: 'No hecho',
    nextLabel: 'sin responder',
    stripe: 'border-l-fallado',
    badge:
      'border-transparent bg-[image:var(--grad-ind-fallado)] text-white shadow-[var(--sombra-ind-fallado)] group-active:shadow-[var(--sombra-ind-fallado-toque)]',
    name: 'text-texto-cuerpo',
    wash: 'linear-gradient(90deg, var(--color-fallado-lavado), transparent 42%)',
  },
}

/**
 * El glifo dentro del disco. La forma distingue los estados sin depender del
 * color: check para "hecho", cruz para "no hecho", nada (anillo vacío) para
 * "sin responder".
 *
 * Sobre el degradado de indicador (ver --grad-ind-hecho/fallado en
 * index.css), el trazo blanco pierde contraste sin ayuda: un trazo más
 * grueso y un contorno oscuro del mismo color de estado lo mantienen
 * legible. `text-shadow` no pinta sobre un `<path>` de SVG -- el
 * equivalente real es `filter: drop-shadow(...)`, con el mismo valor que
 * los tokens --texto-glifo-*.
 */
function Glyph({ status }: { status: EntryStatus }) {
  if (status === 'done') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
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
  }
  if (status === 'not-done') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ filter: 'drop-shadow(var(--texto-glifo-fallado))' }}
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
export default function HabitRow({ name, status, nextStatus, onCycle }: HabitRowProps) {
  const meta = STATUS_META[status]

  // El color del destello se congela al empezar la pulsación (no en cada
  // render): `onCycle` cambia `status` en cuanto se suelta el dedo, y con
  // él cambiaría `nextStatus` a mitad de la salida si lo leyéramos en vivo.
  // Al fijarlo aquí, la salida siempre pinta el color con el que entró.
  const [flashColor, setFlashColor] = useState(() => FLASH_COLOR[nextStatus])

  function captureFlash() {
    setFlashColor(FLASH_COLOR[nextStatus])
  }

  return (
    <button
      type="button"
      onClick={onCycle}
      onPointerDown={captureFlash}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') captureFlash()
      }}
      aria-label={`${name}, ${meta.label.toLowerCase()}. Tocar para cambiar a ${meta.nextLabel}.`}
      className={`group relative flex min-h-11 w-full items-center gap-3 border-l-[3px] py-3 pl-4 pr-4 text-left active:scale-[0.985] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${meta.stripe}`}
      style={{
        // Dos duraciones en la misma fila: el hundimiento al tocar (transform,
        // background-color) responde casi al instante; el color de la franja
        // izquierda, que refleja el estado, usa la transición más pausada.
        transition:
          'transform var(--dur-toque) var(--ease-toque), ' +
          'background-color var(--dur-toque) var(--ease-toque), ' +
          'border-color var(--dur-estado) var(--ease-salida)',
        // El lavado de fondo de hecho/no-hecho (ver STATUS_META.wash): un
        // degradado, así que va como estilo en línea igual que --fondo-app.
        ...(meta.wash ? { background: meta.wash } : {}),
      }}
    >
      {/*
       * El destello: baña toda la fila con el color del estado siguiente.
       * Va primero en el DOM para pintarse debajo del indicador y el nombre.
       * Entra rápido (--dur-toque, al pulsar) y sale lento (--dur-estado, al
       * soltar) — misma idea que arriba, pero con la duración corta en la
       * regla :active en vez de en la de reposo.
       */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--dur-estado)] ease-salida group-active:opacity-100 group-active:duration-[var(--dur-toque)] group-active:ease-toque"
        style={{ backgroundColor: flashColor }}
      />
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
