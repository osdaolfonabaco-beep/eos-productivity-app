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
// Gris azulado neutro para las quincenas pasadas con datos: no hay token de
// este tono en el sistema (los --color-marca-* son para categorías, no para
// esto), así que va puntual — mismo criterio que ya usa ProgressRing para su
// filtro con un color fuera de @theme.
const NEUTRAL_GRADIENT = 'linear-gradient(to bottom, #94A3B8, #64748B)'
const CURRENT_GRADIENT = 'linear-gradient(to bottom, var(--color-acento), var(--color-acento-toque))'

/** `2026-09-16` → `16 sept`. Solo para el tooltip de cada barra. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * Barras verticales de las últimas 6 quincenas (la más antigua a la
 * izquierda, la actual a la derecha). Cada quincena tiene un carril de fondo
 * permanente (hundido, altura completa) para que una quincena sin datos se
 * lea como un hueco vacío y no como un error; la barra de datos crece dentro
 * del carril, apoyada abajo, desde cero al montar — 60ms de desfase respecto
 * a la anterior, mismo criterio que las barras horizontales de
 * `WeekDashboard`.
 */
export default function IncomeQuincenaChart({ history }: { history: QuincenaTotal[] }) {
  const mounted = useMounted()
  const max = Math.max(1, ...history.map((h) => h.total))

  return (
    <div
      role="img"
      aria-label="Entradas de las últimas 6 quincenas, la actual a la derecha"
      className="mt-4 flex items-end gap-3"
      style={{ height: CHART_HEIGHT }}
    >
      {history.map((h, i) => (
        <div
          key={h.start}
          className="relative h-full flex-1 overflow-hidden rounded-[6px] shadow-[var(--sombra-hundida)]"
          style={{ backgroundColor: 'var(--color-separador)' }}
        >
          {h.total > 0 && (
            <div
              title={`${formatShortDate(h.start)}: ${formatCOP(h.total)}`}
              className="absolute inset-x-0 bottom-0 origin-bottom rounded-[6px]"
              style={{
                height: `${(h.total / max) * 100}%`,
                background: h.isCurrent ? CURRENT_GRADIENT : NEUTRAL_GRADIENT,
                boxShadow: h.isCurrent ? 'var(--sombra-acento)' : undefined,
                transform: mounted ? 'scaleY(1)' : 'scaleY(0)',
                transitionProperty: 'transform',
                transitionDuration: 'var(--dur-entrada)',
                transitionTimingFunction: 'var(--ease-salida)',
                transitionDelay: `${i * 60}ms`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
