import { useCallback, useState } from 'react'
import {
  getWeeklyHabitStats,
  requestWeeklyAnalysis,
  todayISO,
  type HabitWeeklyBreakdown,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { useMounted } from '../useMounted'
import { ActionError, LoadError, Loading } from './ViewState'
import WeekProgressRing from './WeekProgressRing'

/**
 * Colores validados por el skill de dataviz del proyecto (references/palette.md
 * de esa skill), sin librería de gráficos: son dos gráficos pequeños con datos
 * mínimos, construidos a mano en SVG, igual que el resto de glifos de la app.
 *
 * Hecho / no hecho son un estado bueno/malo, así que les toca la paleta de
 * ESTADO del skill — y aquí, además, los tokens de la app (--color-hecho /
 * --color-fallado), los mismos que usa el resto de las pantallas: un solo
 * verde y un solo rojo en toda la app, no uno por pantalla. "Sin responder"
 * usa --color-separador, el gris neutro de chrome que ya usa la app para
 * líneas y fondos discretos. Los textos del gráfico (INK_*) usan los tokens
 * de texto de la app por la misma razón.
 *
 * La comparación semana-a-semana ya no usa el azul suelto que tenía antes
 * (ni color de identidad propio): la semana anterior es --color-texto-tenue
 * (un dato de fondo, ya pasado) y esta semana es --color-acento (lo mismo
 * que ya significa "lo actual/seleccionado" en toda la app). El azul
 * desaparece del sistema en vez de quedar sin oficio asignado.
 */
const COLOR_DONE = 'var(--color-hecho)'
const COLOR_NOT_DONE = 'var(--color-fallado)'
const COLOR_UNANSWERED = 'var(--color-separador)'
const COLOR_LAST_WEEK = 'var(--color-texto-tenue)'
const COLOR_THIS_WEEK = 'var(--color-acento)'
const INK_PRIMARY = 'var(--color-texto)'
const INK_SECONDARY = 'var(--color-texto-cuerpo)'

const CHART_WIDTH = 300
const LABEL_WIDTH = 80
const ROW_HEIGHT = 32
const BAR_HEIGHT = 20

function truncate(name: string, max = 13): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/** % de días transcurridos que se cumplieron. 0 si no ha pasado ningún día todavía. */
function pct(stats: { hecho: number; diasTranscurridos: number }): number {
  return stats.diasTranscurridos > 0 ? Math.round((stats.hecho / stats.diasTranscurridos) * 100) : 0
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-apagado">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: it.color }}
            aria-hidden="true"
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/**
 * Barra horizontal apilada por hábito: hecho / no hecho / sin responder de
 * esta semana. Nota: por simplicidad los 3 segmentos llevan una esquina
 * redondeada uniforme en vez de la distinción estricta "cuadrado en el eje,
 * redondeado solo en el extremo final" — en una barra tan compacta no se nota,
 * y evita construir cada segmento como un `path` a mano.
 *
 * Cada barra completa (los 3 segmentos como grupo) crece desde cero al
 * montar, con 60ms de desfase entre una fila y la siguiente. Se anima
 * `transform: scaleX`, no `width`: escalar es una operación de compositor
 * (GPU), cambiar `width` fuerza recalcular la maquetación en cada
 * fotograma. `transform-origin` se fija en coordenadas del propio viewBox
 * (el borde izquierdo de la barra, LABEL_WIDTH), no en el bounding box del
 * grupo, para que crezca desde la izquierda y no desde su centro.
 */
function BreakdownChart({ habitos }: { habitos: HabitWeeklyBreakdown[] }) {
  const mounted = useMounted()
  const valueWidth = 30
  const barWidth = CHART_WIDTH - LABEL_WIDTH - valueWidth - 8
  const height = habitos.length * ROW_HEIGHT

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-label="Cumplimiento por hábito esta semana"
      >
        {habitos.map((h, i) => {
          const { hecho, noHecho, sinResponder, diasTranscurridos } = h.estaSemana
          const total = Math.max(1, hecho + noHecho + sinResponder)
          const unit = barWidth / total
          const y = i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2

          let x = LABEL_WIDTH
          const segments = [
            { key: 'hecho', count: hecho, fill: COLOR_DONE, label: 'Hecho' },
            { key: 'noHecho', count: noHecho, fill: COLOR_NOT_DONE, label: 'No hecho' },
            { key: 'sinResponder', count: sinResponder, fill: COLOR_UNANSWERED, label: 'Sin responder' },
          ]

          return (
            <g key={h.habit.id}>
              <text
                x={LABEL_WIDTH - 6}
                y={y + BAR_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="10"
                fill={INK_SECONDARY}
              >
                {truncate(h.habit.name)}
                <title>{h.habit.name}</title>
              </text>
              <g
                style={{
                  transform: mounted ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: `${LABEL_WIDTH}px ${y + BAR_HEIGHT / 2}px`,
                  transitionProperty: 'transform',
                  transitionDuration: 'var(--dur-entrada)',
                  transitionTimingFunction: 'var(--ease-salida)',
                  transitionDelay: `${i * 60}ms`,
                }}
              >
                {segments.map((seg) => {
                  const w = seg.count * unit
                  const rectX = x
                  x += w
                  if (w <= 0) return null
                  return (
                    <rect
                      key={seg.key}
                      x={rectX + 1}
                      y={y}
                      width={Math.max(0, w - 2)}
                      height={BAR_HEIGHT}
                      rx={3}
                      fill={seg.fill}
                    >
                      <title>{`${h.habit.name} — ${seg.label}: ${seg.count} de ${diasTranscurridos} días`}</title>
                    </rect>
                  )
                })}
              </g>
              <text
                x={LABEL_WIDTH + barWidth + 8}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="600"
                fill={INK_PRIMARY}
                className="tabular-nums"
              >
                {hecho}/{diasTranscurridos}
              </text>
            </g>
          )
        })}
      </svg>
      <Legend
        items={[
          { color: COLOR_DONE, label: 'Hecho' },
          { color: COLOR_NOT_DONE, label: 'No hecho' },
          { color: COLOR_UNANSWERED, label: 'Sin responder' },
        ]}
      />
    </div>
  )
}

/** Flecha hacia arriba: aparece cuando esta semana supera a la anterior. */
function ImproveArrow({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x} ${y + 4} L ${x + 4} ${y - 4} L ${x + 8} ${y + 4} Z`}
      fill={COLOR_DONE}
      aria-hidden="true"
    />
  )
}

/**
 * Dos barras enfrentadas por hábito: la semana anterior detrás, estática; la
 * actual delante, creciendo al montar. Solo entran los hábitos con las dos
 * semanas completas para comparar; si ninguno califica, se explica en vez de
 * dibujar un gráfico vacío o inventar una tendencia.
 */
function ComparisonChart({ habitos }: { habitos: HabitWeeklyBreakdown[] }) {
  const mounted = useMounted()
  const comparable = habitos.filter(
    (h): h is HabitWeeklyBreakdown & { semanaAnterior: NonNullable<HabitWeeklyBreakdown['semanaAnterior']> } =>
      h.semanaAnterior !== null,
  )
  const notComparable = habitos.filter((h) => h.semanaAnterior === null)

  if (comparable.length === 0) {
    return (
      <p className="rounded-tarjeta border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-apagado">
        Todavía no llevas una semana completa antes de esta. La comparación aparece la
        semana que viene.
      </p>
    )
  }

  const valueWidth = 34
  const trackWidth = CHART_WIDTH - LABEL_WIDTH - valueWidth - 8
  const height = comparable.length * ROW_HEIGHT
  const barH = 8
  const gap = 3

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-label="Comparación con la semana anterior"
      >
        {comparable.map((h, i) => {
          const rowY = i * ROW_HEIGHT + (ROW_HEIGHT - (barH * 2 + gap)) / 2
          const prevY = rowY
          const curY = rowY + barH + gap
          const prevPct = pct(h.semanaAnterior)
          const curPct = pct(h.estaSemana)
          const prevWidth = (prevPct / 100) * trackWidth
          const curWidth = (curPct / 100) * trackWidth
          const improved = curPct > prevPct
          const delayMs = i * 60

          return (
            <g key={h.habit.id}>
              <text
                x={LABEL_WIDTH - 6}
                y={rowY + barH + gap / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="10"
                fill={INK_SECONDARY}
              >
                {truncate(h.habit.name)}
                <title>{h.habit.name}</title>
              </text>
              {/* Semana anterior: detrás, estática, sin animar. */}
              <rect x={LABEL_WIDTH} y={prevY} width={prevWidth} height={barH} rx={2} fill={COLOR_LAST_WEEK}>
                <title>{`${h.habit.name} — semana anterior: ${prevPct}%`}</title>
              </rect>
              {/* Esta semana: delante, crece al montar. */}
              <g
                style={{
                  transform: mounted ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: `${LABEL_WIDTH}px ${curY + barH / 2}px`,
                  transitionProperty: 'transform',
                  transitionDuration: 'var(--dur-entrada)',
                  transitionTimingFunction: 'var(--ease-salida)',
                  transitionDelay: `${delayMs}ms`,
                }}
              >
                <rect x={LABEL_WIDTH} y={curY} width={curWidth} height={barH} rx={2} fill={COLOR_THIS_WEEK}>
                  <title>{`${h.habit.name} — esta semana (hasta hoy): ${curPct}%`}</title>
                </rect>
              </g>
              {improved && (
                <g
                  style={{
                    transform: mounted ? 'scale(1)' : 'scale(0.6)',
                    transformOrigin: `${LABEL_WIDTH + curWidth + 10}px ${curY + barH / 2}px`,
                    opacity: mounted ? 1 : 0,
                    transitionProperty: 'transform, opacity',
                    transitionDuration: 'var(--dur-entrada)',
                    transitionTimingFunction: 'var(--ease-rebote)',
                    // Aparece cuando su propia barra ya terminó de crecer.
                    transitionDelay: `${delayMs + 320}ms`,
                  }}
                >
                  <ImproveArrow x={LABEL_WIDTH + curWidth + 6} y={curY + barH / 2} />
                </g>
              )}
              <text
                x={LABEL_WIDTH + trackWidth + 8}
                y={rowY + barH + gap / 2}
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="600"
                fill={improved ? COLOR_DONE : INK_PRIMARY}
                className="tabular-nums"
              >
                {curPct}%
              </text>
            </g>
          )
        })}
      </svg>
      <Legend
        items={[
          { color: COLOR_LAST_WEEK, label: 'Semana anterior' },
          { color: COLOR_THIS_WEEK, label: 'Esta semana (hasta hoy)' },
        ]}
      />
      {notComparable.length > 0 && (
        <p className="mt-2 text-xs text-texto-apagado">
          Muy recientes, sin comparar todavía: {notComparable.map((h) => h.habit.name).join(', ')}.
        </p>
      )}
    </div>
  )
}

/**
 * El dashboard semanal: los dos gráficos con datos reales y, a pedido, una
 * explicación de la IA. Va dentro de Vida -> Semana, debajo de la cuadrícula.
 * Carga por su cuenta (no reutiliza el fetch de `WeekView`): mismo patrón que
 * el resto de la app, donde cada bloque de una pantalla es independiente.
 */
export default function WeekDashboard() {
  const fetcher = useCallback(() => getWeeklyHabitStats(todayISO()), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [explanation, setExplanation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  async function explain() {
    setBusy(true)
    setAiError(null)
    try {
      setExplanation(await requestWeeklyAnalysis())
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudo obtener la explicación.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />
  if (!data || data.habitos.length === 0) return null // WeekView ya cubre el caso sin hábitos

  // No hay un % global ya calculado: se agrega aquí a partir de `estaSemana`
  // de cada hábito (mismos números que ya dibuja BreakdownChart, sumados).
  const totalHecho = data.habitos.reduce((sum, h) => sum + h.estaSemana.hecho, 0)
  const totalDias = data.habitos.reduce((sum, h) => sum + h.estaSemana.diasTranscurridos, 0)
  const weekPct = totalDias > 0 ? Math.round((totalHecho / totalDias) * 100) : 0

  return (
    <section className="mt-8 flex flex-col gap-6">
      <WeekProgressRing
        weekKey={data.semanaActual.inicio}
        weekPct={weekPct}
        totalHecho={totalHecho}
        totalDias={totalDias}
      />

      <div>
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Cumplimiento por hábito</h2>
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
          <BreakdownChart habitos={data.habitos} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Esta semana vs. la anterior</h2>
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
          <ComparisonChart habitos={data.habitos} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Explicación</h2>
        {aiError && <ActionError message={aiError} onDismiss={() => setAiError(null)} />}
        {/*
         * Aguamarina, no neutro: esta acción llama a la IA, y en esta app
         * ese color se reserva para lo que la toca (ver --color-ia en
         * index.css). El mismo criterio que ya usa el aviso de
         * DayCommentSection.
         */}
        <button
          type="button"
          onClick={() => void explain()}
          disabled={busy}
          className="rounded-campo bg-ia px-4 py-3 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-ia-texto)] disabled:bg-transparent disabled:text-texto-tenue"
        >
          {busy ? 'Analizando…' : 'Explicar mi semana'}
        </button>
        {explanation && (
          <p className="mt-3 whitespace-pre-wrap rounded-tarjeta border border-borde bg-tarjeta p-3 text-texto-cuerpo">
            {explanation}
          </p>
        )}
      </div>
    </section>
  )
}
