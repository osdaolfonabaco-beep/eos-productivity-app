import { useId } from 'react'
import { formatCOP } from '../money'
import { useMounted } from '../useMounted'

export interface QuincenaTotal {
  /** El `periodStart` de la quincena, único por quincena — sirve de `key`. */
  start: string
  /** Sueldo + ingresos extra de esa quincena (sin restar gastos ni pagos). */
  total: number
  isCurrent: boolean
}

const CHART_HEIGHT = 72
const BAR_WIDTH = 28
const GAP = 14
// Línea mínima en la base cuando una quincena no tiene datos: nunca un hueco,
// mismo criterio que el anillo de progreso en 0% (ver ProgressRing).
const MIN_BAR_HEIGHT = 3

/** `2026-09-16` → `16 sept`. Solo para el tooltip de cada barra. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * Barras verticales de las últimas 6 quincenas (la más antigua a la
 * izquierda, la actual a la derecha). Cada barra crece desde la base al
 * montar, con 60ms de desfase respecto a la anterior — misma técnica que las
 * barras horizontales de `WeekDashboard`, pero animando `scaleY` con origen
 * abajo en vez de `scaleX` con origen a la izquierda.
 */
export default function IncomeQuincenaChart({ history }: { history: QuincenaTotal[] }) {
  const mounted = useMounted()
  const filterId = useId()
  const max = Math.max(1, ...history.map((h) => h.total))
  const width = history.length * BAR_WIDTH + (history.length - 1) * GAP

  return (
    <svg
      viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
      width="100%"
      height={CHART_HEIGHT}
      role="img"
      aria-label="Entradas de las últimas 6 quincenas, la actual a la derecha"
      className="mt-4"
    >
      <defs>
        {/*
          Aproximación de --sombra-acento como filtro SVG (box-shadow no
          aplica a formas SVG). El color se repite en hex a propósito, como ya
          hace ProgressRing con su resplandor: un filtro SVG no resuelve
          var(--color-acento) de forma fiable en flood-color.
        */}
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#7B5AF0" floodOpacity="0.4" />
        </filter>
      </defs>
      {history.map((h, i) => {
        const x = i * (BAR_WIDTH + GAP)
        const targetHeight = Math.max(MIN_BAR_HEIGHT, (h.total / max) * (CHART_HEIGHT - 4))
        return (
          <g
            key={h.start}
            style={{
              transform: mounted ? 'scaleY(1)' : 'scaleY(0)',
              transformOrigin: `${x + BAR_WIDTH / 2}px ${CHART_HEIGHT}px`,
              transitionProperty: 'transform',
              transitionDuration: 'var(--dur-entrada)',
              transitionTimingFunction: 'var(--ease-salida)',
              transitionDelay: `${i * 60}ms`,
            }}
          >
            <rect
              x={x}
              y={CHART_HEIGHT - targetHeight}
              width={BAR_WIDTH}
              height={targetHeight}
              rx={4}
              fill={h.isCurrent ? 'var(--color-acento)' : 'var(--color-separador)'}
              filter={h.isCurrent ? `url(#${filterId})` : undefined}
            >
              <title>{`${formatShortDate(h.start)}: ${formatCOP(h.total)}`}</title>
            </rect>
          </g>
        )
      })}
    </svg>
  )
}
