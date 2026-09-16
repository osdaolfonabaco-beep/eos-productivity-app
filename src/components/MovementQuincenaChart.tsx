import { formatCOP } from '../money'
import { useMounted } from '../useMounted'

export interface MovementQuincenaTotal {
  /** El `periodStart` de la quincena, único por quincena — sirve de `key`. */
  start: string
  /** Sueldo + ingresos extra de esa quincena. */
  entrada: number
  /** Gastos reales de esa quincena. */
  salida: number
  isCurrent: boolean
}

const CHART_HEIGHT = 72

/**
 * Tonos de --color-hecho/--color-fallado: aquí el color SÍ es de estado
 * (entrar y salir dinero son estados opuestos), a diferencia de
 * `IncomeCategoryBreakdown`, donde una categoría nunca lleva un color de
 * estado. Las quincenas pasadas van en un tono más pálido que la actual —
 * mismo tono, no un color distinto — porque distinguir "lo actual" es
 * trabajo del borde violeta del carril, no del color de las barras.
 */
const ENTRADA_GRADIENT_PAST =
  'linear-gradient(to bottom, color-mix(in srgb, var(--color-hecho) 55%, white 45%), color-mix(in srgb, var(--color-hecho) 75%, white 25%))'
const ENTRADA_GRADIENT_CURRENT =
  'linear-gradient(to bottom, color-mix(in srgb, var(--color-hecho) 100%, white 15%), var(--color-hecho))'
const SALIDA_GRADIENT_PAST =
  'linear-gradient(to bottom, color-mix(in srgb, var(--color-fallado) 55%, white 45%), color-mix(in srgb, var(--color-fallado) 75%, white 25%))'
const SALIDA_GRADIENT_CURRENT =
  'linear-gradient(to bottom, color-mix(in srgb, var(--color-fallado) 100%, white 15%), var(--color-fallado))'

/** `2026-09-16` → `16 sept`. Solo para el tooltip de cada barra. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function Bar({
  amount,
  max,
  gradient,
  mounted,
  delayMs,
  title,
}: {
  amount: number
  max: number
  gradient: string
  mounted: boolean
  delayMs: number
  title: string
}) {
  if (amount <= 0) return <div className="h-full flex-1" />
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-[3px]">
      <div
        title={title}
        className="absolute inset-x-0 bottom-0 origin-bottom rounded-[3px]"
        style={{
          height: `${(amount / max) * 100}%`,
          background: gradient,
          transform: mounted ? 'scaleY(1)' : 'scaleY(0)',
          transitionProperty: 'transform',
          transitionDuration: 'var(--dur-entrada)',
          transitionTimingFunction: 'var(--ease-salida)',
          transitionDelay: `${delayMs}ms`,
        }}
      />
    </div>
  )
}

/**
 * Barras verticales de las últimas 6 quincenas (la más antigua a la
 * izquierda, la actual a la derecha). Cada quincena tiene un carril de fondo
 * permanente (hundido, altura completa) para que una quincena sin datos se
 * lea como un hueco vacío, y ahora lleva DOS barras lado a lado dentro del
 * mismo carril: lo que entró y lo que salió. La quincena actual se marca con
 * un borde `--color-acento` alrededor de todo el carril — una marca que no
 * depende del color de las barras, porque esas ya usan verde/rojo de
 * estado y no quedaba color libre para "esto es ahora". Ambas barras crecen
 * al montar con el mismo desfase por carril que ya tenía el gráfico de una
 * sola barra (60ms respecto al carril anterior).
 */
export default function MovementQuincenaChart({ history }: { history: MovementQuincenaTotal[] }) {
  const mounted = useMounted()
  const max = Math.max(1, ...history.flatMap((h) => [h.entrada, h.salida]))

  return (
    <div
      role="img"
      aria-label="Entradas y salidas de las últimas 6 quincenas, la actual a la derecha con borde violeta"
      className="mt-4 flex items-end gap-3"
      style={{ height: CHART_HEIGHT }}
    >
      {history.map((h, i) => (
        <div
          key={h.start}
          className={`h-full flex-1 overflow-hidden rounded-[6px] shadow-[var(--sombra-hundida)] ${
            h.isCurrent ? 'ring-2 ring-inset ring-acento' : ''
          }`}
          style={{ backgroundColor: 'var(--color-separador)' }}
        >
          <div className="flex h-full items-end gap-[3px] p-[2px]">
            <Bar
              amount={h.entrada}
              max={max}
              gradient={h.isCurrent ? ENTRADA_GRADIENT_CURRENT : ENTRADA_GRADIENT_PAST}
              mounted={mounted}
              delayMs={i * 60}
              title={`${formatShortDate(h.start)} · Entró: ${formatCOP(h.entrada)}`}
            />
            <Bar
              amount={h.salida}
              max={max}
              gradient={h.isCurrent ? SALIDA_GRADIENT_CURRENT : SALIDA_GRADIENT_PAST}
              mounted={mounted}
              delayMs={i * 60}
              title={`${formatShortDate(h.start)} · Salió: ${formatCOP(h.salida)}`}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
