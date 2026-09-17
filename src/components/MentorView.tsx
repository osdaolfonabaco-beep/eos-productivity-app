import { useCallback, useState } from 'react'
import {
  archiveMentorAnalysis,
  firstWords,
  formatAnalysisDate,
  getMentorActivitySummary,
  getWeekCompletionPercentages,
  groupMentorAnalysesByMonth,
  listAllMentorAnalyses,
  listMentorAnalyses,
  todayISO,
  type MentorAnalysis,
  type MentorAnalysisType,
  type WeekCompletion,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import SectionNav from './SectionNav'
import { ActionError, LoadError, Loading } from './ViewState'

/** Un límite generoso para una app de un solo usuario; sin paginación todavía. */
const LIST_LIMIT = 200

type Filter = 'todos' | 'diario' | 'semanal'

const FILTER_ITEMS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'diario', label: 'Diarios' },
  // "Mensuales" no se ofrece todavía: ese tipo de análisis no existe en la
  // app, aunque el esquema ya lo admita para cuando llegue.
  { value: 'semanal', label: 'Semanales' },
]

const TIPO_LABELS: Record<MentorAnalysisType, string> = {
  diario: 'Diario',
  semanal: 'Semanal',
  mensual: 'Mensual',
}

/** Flecha hacia abajo, que gira al expandir. Mismo criterio de icono a mano que el resto de la app. */
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/**
 * El % de cumplimiento de la semana de un análisis semanal, con la
 * diferencia contra el análisis semanal anterior si se pudo calcular, y un
 * asterisco discreto si `quizasIncompleto` -- que al tocarlo explica por
 * qué el número podría no ser exacto (ver el comentario grande de
 * `getWeekCompletionPercentages`, en `src/data/weeklyStats.ts`).
 */
function ComplianceBadge({
  completion,
  diff,
}: {
  completion: WeekCompletion
  diff: number | null
}) {
  const [showNote, setShowNote] = useState(false)

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5 text-meta">
        <span className="tabular-nums font-semibold text-texto-cuerpo">{completion.pct}%</span>
        {diff !== null && diff !== 0 && (
          <span className={`tabular-nums font-medium ${diff > 0 ? 'text-ind-hecho' : 'text-ind-fallado'}`}>
            {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}%
          </span>
        )}
        {completion.quizasIncompleto && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowNote((s) => !s)
            }}
            aria-label="Aviso sobre este porcentaje"
            className="text-texto-tenue underline decoration-dotted"
          >
            *
          </button>
        )}
      </div>
      {showNote && (
        <p className="mt-0.5 text-meta text-texto-tenue">
          Un hábito de esa semana está archivado hoy: el porcentaje podría no ser exacto.
        </p>
      )}
    </div>
  )
}

type RowMode = 'view' | 'confirm-archive'

/**
 * Un análisis en la lista completa: fecha, tipo y primeras palabras;
 * despliega el texto completo al tocarlo. `compliance`, si se pasa (solo
 * para análisis semanales), añade el cruce con el cumplimiento de esa
 * semana debajo de la fecha.
 */
function HistoryRow({
  analysis,
  today,
  compliance,
  onArchive,
}: {
  analysis: MentorAnalysis
  today: string
  compliance: { completion: WeekCompletion; diff: number | null } | null
  onArchive: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<RowMode>('view')
  const [menuOpen, setMenuOpen] = useState(false)

  if (mode === 'confirm-archive') {
    return (
      <div className="p-3">
        <p className="text-sm text-texto-apagado">Se archivará: sale del historial pero se conserva.</p>
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
            className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/*
       * Dos bloques, no uno: `ComplianceBadge` lleva su propio botón (el
       * asterisco), y un <button> no puede anidar otro <button> -- HTML
       * inválido, además de romper qué onClick gana. Por eso la fecha/tipo
       * y el cumplimiento van en un encabezado sin envolver en botón, y
       * "tocar para desplegar" se limita al texto + chevron, debajo.
       */}
      <div className="flex items-start gap-2 px-3 pt-2">
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-meta text-texto-tenue">
            {formatAnalysisDate(analysis.periodStart, today)} · {TIPO_LABELS[analysis.tipo]}
          </span>
          {compliance && <ComplianceBadge completion={compliance.completion} diff={compliance.diff} />}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Más acciones para este análisis"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          ⋯
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-start gap-2 px-3 pb-2 pt-1 text-left transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
      >
        <span
          className={`min-w-0 flex-1 break-words ${
            expanded ? 'text-lectura text-texto-cuerpo' : 'text-contenido text-texto-apagado'
          }`}
        >
          {expanded ? analysis.contenido : firstWords(analysis.contenido)}
        </span>
        <span
          aria-hidden="true"
          className={`mt-1 shrink-0 text-texto-tenue transition-transform duration-[var(--dur-toque)] ease-toque ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronIcon />
        </span>
      </button>

      {menuOpen && (
        <div className="flex gap-2 border-y-[0.5px] border-separador bg-[var(--color-menu-fondo)] px-3 py-2">
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

/** Una de las tres cifras de la tarjeta de actividad. */
function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="tabular-nums text-destacado text-texto">{value}</p>
      <p className="mt-0.5 text-meta text-texto-tenue">{label}</p>
    </div>
  )
}

/**
 * La pantalla completa del historial del Mentor: filtro por tipo, lista
 * agrupada por mes, y el cruce con el cumplimiento en cada análisis
 * semanal. Se abre desde "Ver todo el historial" en la sección Mentor de
 * Hoy (ver App.tsx) -- no vive en la barra inferior ni en ningún
 * SectionNav de sección.
 */
export default function MentorView({ onClose }: { onClose: () => void }) {
  const today = todayISO()
  const [filter, setFilter] = useState<Filter>('todos')

  const listFetcher = useCallback(
    () => (filter === 'todos' ? listAllMentorAnalyses(LIST_LIMIT) : listMentorAnalyses(filter, LIST_LIMIT)),
    [filter],
  )
  const { data: analyses, loading, error, reload } = useAsyncData(listFetcher, [filter])

  // Independiente del filtro: el cruce "semana vs. semana anterior" necesita
  // el orden real de TODOS los análisis semanales, no solo los que el
  // filtro actual esté mostrando (si el filtro es "Diarios", por ejemplo,
  // igual hace falta saber cuál semanal es "el anterior" de cuál).
  const semanalFetcher = useCallback(() => listMentorAnalyses('semanal', LIST_LIMIT), [])
  const { data: semanales, reload: reloadSemanales } = useAsyncData(semanalFetcher)

  const pctFetcher = useCallback(() => {
    if (!semanales || semanales.length === 0) return Promise.resolve(new Map<string, WeekCompletion>())
    return getWeekCompletionPercentages(semanales.map((a) => a.periodStart))
  }, [semanales])
  const { data: pctByWeek } = useAsyncData(pctFetcher, [semanales])

  const summaryFetcher = useCallback(() => getMentorActivitySummary(), [])
  const { data: summary, reload: reloadSummary } = useAsyncData(summaryFetcher)

  const [actionError, setActionError] = useState<string | null>(null)

  async function archive(id: string) {
    setActionError(null)
    try {
      await archiveMentorAnalysis(id)
      reload()
      reloadSemanales()
      reloadSummary()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo archivar.')
    }
  }

  /**
   * El cruce de un análisis semanal: su propio % y, si existe un análisis
   * semanal anterior DISTINTO en fecha (para no comparar una semana consigo
   * misma si se pidió el análisis dos veces), la diferencia contra él. Si
   * cualquiera de los dos % no se pudo calcular, no hay diferencia que
   * mostrar -- nunca se inventa.
   */
  function complianceFor(
    analysis: MentorAnalysis,
  ): { completion: WeekCompletion; diff: number | null } | null {
    if (analysis.tipo !== 'semanal' || !pctByWeek || !semanales) return null
    const completion = pctByWeek.get(analysis.periodStart)
    if (!completion) return null

    const idx = semanales.findIndex((a) => a.id === analysis.id)
    const previous =
      idx === -1 ? undefined : semanales.slice(idx + 1).find((a) => a.periodStart < analysis.periodStart)
    const previousPct = previous ? pctByWeek.get(previous.periodStart) : undefined

    return { completion, diff: previousPct ? completion.pct - previousPct.pct : null }
  }

  const groups = analyses ? groupMentorAnalysesByMonth(analyses) : []

  return (
    <main className="pb-8 text-texto">
      <div className="px-4 pt-4">
        <button type="button" onClick={onClose} className="mb-3 text-sm text-texto-apagado">
          ‹ Volver
        </button>
        <h1 className="text-titulo">Mentor</h1>
      </div>

      {/* D) Resumen de actividad */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
          <SummaryStat label="Análisis" value={summary ? String(summary.total) : '—'} />
          <SummaryStat label="Este mes" value={summary ? String(summary.esteMes) : '—'} />
          <SummaryStat
            label="Último"
            value={summary ? (summary.ultimo ? formatAnalysisDate(summary.ultimo, today) : '—') : '—'}
          />
        </div>
      </div>

      {/*
       * E) Sitio reservado para el resumen acumulado, el "para qué" y el
       * plan de mejora -- pasos siguientes. A propósito no hay ningún
       * elemento aquí todavía: nada de secciones vacías ni texto de
       * relleno, solo este comentario marcando dónde van a entrar.
       */}

      <SectionNav items={FILTER_ITEMS} active={filter} onChange={setFilter} />

      {actionError && (
        <div className="px-4 pt-3">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <div className="px-4 pt-3">
        {loading && !analyses ? (
          <Loading />
        ) : error && !analyses ? (
          <LoadError onRetry={reload} />
        ) : groups.length === 0 ? (
          <p className="rounded-tarjeta border border-dashed border-borde px-4 py-8 text-center text-texto-apagado">
            No tienes análisis todavía.{' '}
            <button type="button" onClick={onClose} className="font-medium underline">
              Ve a Hoy
            </button>{' '}
            para pedir el primero.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.month}>
                <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">{group.label}</h2>
                <div className="overflow-hidden divide-y divide-separador rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
                  {group.analyses.map((a) => (
                    <HistoryRow
                      key={a.id}
                      analysis={a}
                      today={today}
                      compliance={complianceFor(a)}
                      onArchive={() => void archive(a.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
