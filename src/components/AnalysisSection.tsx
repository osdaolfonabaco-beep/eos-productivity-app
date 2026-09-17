import { useCallback, useEffect, useState } from 'react'
import {
  archiveMentorAnalysis,
  firstWords,
  formatAnalysisDate,
  listMentorAnalyses,
  requestAnalysis,
  todayISO,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { useMounted } from '../useMounted'
import { ActionError, LoadError, Loading } from './ViewState'

/** Cuántos análisis se muestran: el más reciente expandido + estos dos plegados. */
const HISTORY_LIMIT = 3

/** Flecha hacia abajo, que gira al expandir. Mismo criterio de icono a mano que el resto de la app (ver ChevronIcon en WeeklyGoalsSection). */
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
 * Un análisis ya resuelto para pintar en pantalla, venga de la base o de una
 * petición que se acaba de hacer. `pending`/`failed` solo tienen sentido
 * para el segundo caso -- ver el comentario grande sobre `pending`, más
 * abajo en `AnalysisSection`.
 */
interface DisplayEntry {
  id: string
  contenido: string
  periodStart: string
  pending: boolean
  failed: boolean
}

/**
 * El análisis más reciente, siempre desplegado. Remonta (vía `key`, en
 * `AnalysisSection`) cada vez que cambia el contenido, para que la entrada
 * "suba" con una transición en vez de sustituirse en seco -- mismo mecanismo
 * que `JournalRevealed` en JournalView.tsx.
 */
function ExpandedAnalysis({ entry, today }: { entry: DisplayEntry; today: string }) {
  const mounted = useMounted()
  return (
    <div
      className={`p-3 transition-[opacity,transform] duration-[var(--dur-entrada)] ease-salida ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <span className="flex items-center gap-1.5 text-meta text-texto-tenue">
        {formatAnalysisDate(entry.periodStart, today)}
        {entry.failed && <span className="text-fallado">· no guardado</span>}
      </span>
      <p className="mt-1 whitespace-pre-wrap break-words text-lectura text-texto-cuerpo">
        {entry.contenido}
      </p>
    </div>
  )
}

type FoldedMode = 'view' | 'confirm-archive'

/**
 * Un análisis anterior, plegado: fecha + primeras palabras, se despliega al
 * tocarlo. El menú "⋯" con Archivar solo aparece si NO es `pending` -- una
 * entrada que todavía no se confirmó guardada no tiene un id real que
 * archivar (ver el comentario grande sobre `pending` en `AnalysisSection`).
 */
function FoldedAnalysisRow({
  entry,
  today,
  onArchive,
}: {
  entry: DisplayEntry
  today: string
  onArchive: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<FoldedMode>('view')
  const [menuOpen, setMenuOpen] = useState(false)

  if (mode === 'confirm-archive') {
    return (
      <div className="border-t-[0.5px] border-separador p-3">
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
    <div className="border-t-[0.5px] border-separador">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex min-h-11 flex-1 items-start gap-2 px-3 py-2 text-left transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-meta text-texto-tenue">
              {formatAnalysisDate(entry.periodStart, today)}
              {entry.failed && <span className="text-fallado">· no guardado</span>}
            </span>
            <span
              className={`mt-0.5 block break-words ${
                expanded ? 'text-lectura text-texto-cuerpo' : 'text-contenido text-texto-apagado'
              }`}
            >
              {expanded ? entry.contenido : firstWords(entry.contenido)}
            </span>
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

        {!entry.pending && (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Más acciones para este análisis"
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            ⋯
          </button>
        )}
      </div>

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

/** Lo que hace falta guardar localmente de un análisis recién pedido, antes de que se confirme en la base. */
interface PendingEntry {
  id: string
  contenido: string
  periodStart: string
  failed: boolean
}

/**
 * La sección Mentor de Hoy: pide un análisis diario y muestra el historial
 * reciente (el más reciente desplegado, los dos anteriores plegados).
 * `onOpenMentor` abre la pantalla completa del historial (ver App.tsx).
 */
export default function AnalysisSection({ onOpenMentor }: { onOpenMentor: () => void }) {
  const today = todayISO()
  const fetcher = useCallback(() => listMentorAnalyses('diario', HISTORY_LIMIT), [])
  const { data: history, loading, error, reload } = useAsyncData(fetcher)

  /**
   * ============================================================================
   * NO QUITES `pending` SIN LEER ESTO ANTES
   * ============================================================================
   * `requestAnalysis` (en `./analysis`) guarda el análisis en `mentor_analyses`
   * SIN esperar a que termine -- a propósito, para no retrasar la lectura de
   * un texto que la IA ya tardó en producir. Eso significa que cuando
   * `requestAnalysis()` devuelve el texto AQUÍ, la fila todavía puede no
   * existir en la base: el `insert` sale después, sin ninguna garantía de en
   * qué orden llega frente a la siguiente lectura del historial
   * (`listMentorAnalyses`, más abajo en `reload()`). En la práctica lo normal
   * es que la lectura gane esa carrera.
   *
   * `pending` es la sombra local que cubre exactamente esa ventana: el
   * análisis que acabas de pedir se ve al instante, aunque la base todavía
   * no lo tenga. El `useEffect` de aquí abajo retira de `pending` cualquier
   * entrada cuyo texto ya aparezca en el historial recién recargado -- en
   * cuanto el guardado en segundo plano se confirma, la entrada de mentira
   * desaparece sola y la real (con su id de verdad, archivable) ocupa su
   * sitio sin que se note el cambio.
   *
   * Si quitas `pending` y confías solo en `reload()`, vuelve el síntoma
   * "pedí un análisis y no apareció en la lista": no es un bug de lectura,
   * es esta carrera, ganada por el lado equivocado.
   * ============================================================================
   */
  const [pending, setPending] = useState<PendingEntry[]>([])

  useEffect(() => {
    if (!history) return
    setPending((prev) => prev.filter((p) => !history.some((a) => a.contenido === p.contenido)))
  }, [history])

  const [busy, setBusy] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setRequestError(null)
    const localId = crypto.randomUUID()
    try {
      const contenido = await requestAnalysis(() => {
        // El guardado falló del todo (sin red, error de la base): no hay
        // reintento, solo se marca para que quede claro que no va a estar
        // mañana. Ver el comentario grande sobre `pending` más arriba.
        setPending((prev) => prev.map((p) => (p.id === localId ? { ...p, failed: true } : p)))
      })
      setPending((prev) => [{ id: localId, contenido, periodStart: today, failed: false }, ...prev])
      reload()
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'No se pudo obtener el análisis.')
    } finally {
      setBusy(false)
    }
  }

  async function archive(id: string) {
    setActionError(null)
    try {
      await archiveMentorAnalysis(id)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo archivar.')
    }
  }

  const combined: DisplayEntry[] = [
    ...pending.map((p) => ({
      id: p.id,
      contenido: p.contenido,
      periodStart: p.periodStart,
      pending: true,
      failed: p.failed,
    })),
    ...(history ?? []).map((a) => ({
      id: a.id,
      contenido: a.contenido,
      periodStart: a.periodStart,
      pending: false,
      failed: false,
    })),
  ].slice(0, HISTORY_LIMIT)

  const [top, ...folded] = combined
  const hasToday = combined.some((e) => e.periodStart === today)

  return (
    <section className="px-4 pt-6 text-texto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-etiqueta uppercase etiqueta-calido">Mentor</h2>
        <button
          type="button"
          onClick={onOpenMentor}
          className="-mr-2 flex min-h-11 items-center px-2 text-meta font-medium text-[var(--color-acento-texto)] transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
        >
          Panel del mentor
        </button>
      </div>

      {requestError && (
        <ActionError message={requestError} onDismiss={() => setRequestError(null)} />
      )}
      {actionError && <ActionError message={actionError} onDismiss={() => setActionError(null)} />}

      <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="w-full rounded-campo bg-[image:var(--grad-calido)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--sombra-calido)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:shadow-[var(--sombra-calido-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
        >
          {busy ? 'Analizando…' : hasToday ? 'Pedir otro' : 'Pedir al mentor'}
        </button>
      </div>

      <div className="mt-3">
        {loading && !history ? (
          <Loading />
        ) : error && !history ? (
          <LoadError onRetry={reload} />
        ) : combined.length === 0 ? (
          <p className="rounded-tarjeta border border-dashed border-borde px-4 py-8 text-center text-texto-apagado">
            Pide tu primer análisis para empezar el historial.
          </p>
        ) : (
          <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
            <ExpandedAnalysis key={top.contenido} entry={top} today={today} />
            {folded.map((entry) => (
              <FoldedAnalysisRow
                key={entry.id}
                entry={entry}
                today={today}
                onArchive={() => void archive(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
