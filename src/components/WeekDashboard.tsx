import { useCallback, useState } from 'react'
import {
  getWeeklyHabitStats,
  requestWeeklyAnalysis,
  todayISO,
  type HabitWeeklyBreakdown,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, LoadError, Loading } from './ViewState'

/**
 * Colores validados por el skill de dataviz del proyecto (references/palette.md
 * de esa skill), sin librería de gráficos: son dos gráficos pequeños con datos
 * mínimos, construidos a mano en SVG, igual que el resto de glifos de la app.
 *
 * Hecho / no hecho son un estado bueno/malo, así que les toca la paleta de
 * ESTADO del skill (verde/rojo reservados), no un tono categórico cualquiera —
 * y de paso es el mismo lenguaje que ya usa toda la app. "Sin responder" es el
 * gris neutro de chrome del propio skill (gridline/axis), no un tercer estado
 * con significado. La comparación semana-a-semana usa un solo tono (azul, el
 * slot categórico 1) en dos intensidades: "antes/después por elemento" pide
 * exactamente eso, no dos colores de identidad.
 */
const COLOR_DONE = '#0ca30c'
const COLOR_NOT_DONE = '#d03b3b'
const COLOR_UNANSWERED = '#e1e0d9'
const COLOR_LAST_WEEK = '#86b6ef'
const COLOR_THIS_WEEK = '#2a78d6'
const INK_PRIMARY = '#0b0b0b'
const INK_SECONDARY = '#52514e'
const INK_MUTED = '#898781'
const RING = '#ffffff' // el fondo real de la tarjeta que envuelve cada gráfico

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
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
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
 */
function BreakdownChart({ habitos }: { habitos: HabitWeeklyBreakdown[] }) {
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
              <text
                x={LABEL_WIDTH + barWidth + 8}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="600"
                fill={INK_PRIMARY}
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

/**
 * Dumbbell por hábito: % de esta semana vs. % de la anterior. Solo entran los
 * hábitos con las dos semanas completas para comparar; si ninguno califica,
 * se explica en vez de dibujar un gráfico vacío o inventar una tendencia.
 */
function ComparisonChart({ habitos }: { habitos: HabitWeeklyBreakdown[] }) {
  const comparable = habitos.filter(
    (h): h is HabitWeeklyBreakdown & { semanaAnterior: NonNullable<HabitWeeklyBreakdown['semanaAnterior']> } =>
      h.semanaAnterior !== null,
  )
  const notComparable = habitos.filter((h) => h.semanaAnterior === null)

  if (comparable.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
        Todavía no llevas una semana completa antes de esta. La comparación aparece la
        semana que viene.
      </p>
    )
  }

  const valueWidth = 34
  const trackWidth = CHART_WIDTH - LABEL_WIDTH - valueWidth - 8
  const height = comparable.length * ROW_HEIGHT

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-label="Comparación con la semana anterior"
      >
        {comparable.map((h, i) => {
          const y = i * ROW_HEIGHT + ROW_HEIGHT / 2
          const prevPct = pct(h.semanaAnterior)
          const curPct = pct(h.estaSemana)
          const x1 = LABEL_WIDTH + (prevPct / 100) * trackWidth
          const x2 = LABEL_WIDTH + (curPct / 100) * trackWidth

          return (
            <g key={h.habit.id}>
              <text
                x={LABEL_WIDTH - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="10"
                fill={INK_SECONDARY}
              >
                {truncate(h.habit.name)}
                <title>{h.habit.name}</title>
              </text>
              <line
                x1={LABEL_WIDTH}
                y1={y}
                x2={LABEL_WIDTH + trackWidth}
                y2={y}
                stroke="#e1e0d9"
                strokeWidth={1}
              />
              <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK_MUTED} strokeWidth={2} strokeLinecap="round" />
              <circle cx={x1} cy={y} r={5} fill={COLOR_LAST_WEEK} stroke={RING} strokeWidth={2}>
                <title>{`${h.habit.name} — semana anterior: ${prevPct}%`}</title>
              </circle>
              <circle cx={x2} cy={y} r={5} fill={COLOR_THIS_WEEK} stroke={RING} strokeWidth={2}>
                <title>{`${h.habit.name} — esta semana (hasta hoy): ${curPct}%`}</title>
              </circle>
              <text
                x={LABEL_WIDTH + trackWidth + 8}
                y={y}
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="600"
                fill={curPct >= prevPct ? '#006300' : INK_PRIMARY}
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
        <p className="mt-2 text-xs text-gray-500">
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

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Cumplimiento por hábito</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <BreakdownChart habitos={data.habitos} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Esta semana vs. la anterior</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <ComparisonChart habitos={data.habitos} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Explicación</h2>
        {aiError && <ActionError message={aiError} onDismiss={() => setAiError(null)} />}
        <button
          type="button"
          onClick={() => void explain()}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          {busy ? 'Analizando…' : 'Explicar mi semana'}
        </button>
        {explanation && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-white p-3 text-gray-800">
            {explanation}
          </p>
        )}
      </div>
    </section>
  )
}
