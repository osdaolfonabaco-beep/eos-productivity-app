import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import {
  archiveIdea,
  createIdea,
  listArchivedIdeas,
  listIdeas,
  requestIdeaAnalysis,
  setIdeaStatus,
  updateIdeaText,
  type Idea,
  type IdeaStatus,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import IdeaCard, { STATUS_ACTIVE_CLASS, STATUSES, type IdeaAnalysisState } from './IdeaCard'
import { ActionError, LoadError, Loading } from './ViewState'

/** Quita la clave `id` de un registro, sin tocar las demás. */
function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _drop, ...rest } = record
  return rest
}

/**
 * Una idea archivada: solo texto y una pastilla con su estado, de solo
 * lectura -- ninguna de las acciones de la lista activa (editar, archivar,
 * analizar) tiene sentido aquí. La única excepción es 'hecha': como marcarla
 * archiva sola, la forma de "volver atrás" es esta fila, con dos pastillas
 * para reabrirla en 'pendiente' o 'en-marcha' (lo que también la desarchiva,
 * ver `setIdeaStatus`). Un toque, sin confirmación: es una corrección, no
 * una acción que cierre nada.
 */
function ArchivedIdeaRow({
  idea,
  onReopen,
}: {
  idea: Idea
  onReopen: (status: IdeaStatus) => void
}) {
  const label = STATUSES.find((s) => s.value === idea.status)?.label ?? idea.status
  return (
    <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
      <p
        className={`whitespace-pre-wrap break-words text-lectura ${
          idea.status === 'descartada' ? 'text-texto-tenue' : 'text-texto-cuerpo'
        }`}
      >
        {idea.text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-pastilla px-3 py-1 text-xs font-medium ${STATUS_ACTIVE_CLASS[idea.status]}`}>
          {label}
        </span>
        {idea.status === 'hecha' && (
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={() => onReopen('pendiente')}
              className="rounded-pastilla border border-borde bg-[image:var(--grad-neutro)] px-3 py-1 text-xs font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
            >
              Pendiente
            </button>
            <button
              type="button"
              onClick={() => onReopen('en-marcha')}
              className="rounded-pastilla border border-borde bg-[image:var(--grad-neutro)] px-3 py-1 text-xs font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
            >
              En marcha
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * La pantalla "Ideas": un campo para anotar (mínima fricción) y la lista,
 * más recientes primero. Cada idea tiene sus cuatro pastillas de estado,
 * edición del texto en línea, archivado con confirmación, y (si no está
 * descartada) un análisis de IA a pedido. Debajo, con un toggle, las
 * archivadas: incluyen tanto las archivadas a mano como las marcadas como
 * 'hecha' -- es el único sitio de la app desde donde se ven.
 */
export default function IdeasView() {
  const fetcher = useCallback(() => listIdeas(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  // Las archivadas solo se piden de verdad cuando el toggle está abierto
  // (si no, el fetcher resuelve una lista vacía sin llamar a Supabase); al
  // cambiar `showArchived` se vuelven a pedir, como en `WeekView` con la semana.
  const [showArchived, setShowArchived] = useState(false)
  const archivedFetcher = useCallback(
    () => (showArchived ? listArchivedIdeas() : Promise.resolve([] as Idea[])),
    [showArchived],
  )
  const {
    data: archivedData,
    loading: archivedLoading,
    error: archivedError,
    reload: reloadArchived,
  } = useAsyncData(archivedFetcher, [showArchived])

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  // El análisis de IA es independiente del resto de acciones (crear/editar/
  // archivar): no se guarda en Supabase, vive aquí y se pierde al recargar.
  // Solo una idea a la vez: `analyzingId` es la que está en curso.
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analysisResults, setAnalysisResults] = useState<Record<string, IdeaAnalysisState>>({})

  // Cualquier acción puede mover una idea entre las dos listas (archivar,
  // marcar como hecha, reabrir una hecha) -- las dos se recargan siempre,
  // no solo la de donde salió la acción.
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
      reloadArchived()
    } catch {
      setActionError(message)
      reload()
      reloadArchived()
    } finally {
      setBusy(false)
    }
  }

  function submit() {
    const clean = text.trim()
    if (!clean || busy) return
    setText('')
    fieldRef.current?.focus()
    void run(() => createIdea(clean), 'No se pudo guardar la idea.')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter guarda; Shift+Enter hace salto de línea (en el móvil está el botón).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  async function analyze(idea: Idea) {
    if (analyzingId || idea.status === 'descartada' || idea.status === 'hecha') return
    setAnalyzingId(idea.id)
    setAnalysisResults((prev) => without(prev, idea.id))
    try {
      const analysisText = await requestIdeaAnalysis(idea.text, idea.status)
      setAnalysisResults((prev) => ({ ...prev, [idea.id]: { text: analysisText } }))
    } catch (err) {
      setAnalysisResults((prev) => ({
        ...prev,
        [idea.id]: { error: err instanceof Error ? err.message : 'No se pudo analizar la idea.' },
      }))
    } finally {
      setAnalyzingId(null)
    }
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const ideas = data ?? []

  return (
    <main className="px-4 py-6 text-texto">
      <h1 className="mb-4 text-titulo">Ideas</h1>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <div className="mb-6">
        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          autoFocus
          placeholder="¿Qué se te ocurrió?"
          aria-label="Anota una idea"
          className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || busy}
            className="rounded-campo bg-[image:var(--grad-calido)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-calido)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-calido-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            Guardar idea
          </button>
        </div>
      </div>

      {ideas.length === 0 ? (
        <p className="rounded-tarjeta border border-dashed border-borde px-4 py-8 text-center text-texto-apagado">
          Aún no has anotado ninguna idea.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <IdeaCard
                idea={idea}
                onSetStatus={(status) =>
                  void run(
                    () => setIdeaStatus(idea.id, status),
                    'No se pudo cambiar el estado.',
                  )
                }
                onSaveText={(t) =>
                  void run(async () => {
                    await updateIdeaText(idea.id, t)
                    // El análisis que hubiera quedaba de un texto que ya no existe.
                    setAnalysisResults((prev) => without(prev, idea.id))
                  }, 'No se pudo guardar el texto.')
                }
                onArchive={() =>
                  void run(() => archiveIdea(idea.id), 'No se pudo archivar.')
                }
                analyzing={analyzingId === idea.id}
                analyzeDisabled={analyzingId !== null && analyzingId !== idea.id}
                analysisResult={analysisResults[idea.id]}
                onAnalyze={() => void analyze(idea)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t-[0.5px] border-separador pt-4">
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-sm font-medium text-texto-apagado underline"
        >
          {showArchived ? 'Ocultar archivadas' : 'Ver archivadas'}
        </button>

        {showArchived && (
          <div className="mt-3">
            {archivedLoading && !archivedData ? (
              <Loading />
            ) : archivedError && !archivedData ? (
              <LoadError onRetry={reloadArchived} />
            ) : (archivedData ?? []).length === 0 ? (
              <p className="text-sm text-texto-apagado">No hay ideas archivadas.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(archivedData ?? []).map((idea) => (
                  <li key={idea.id}>
                    <ArchivedIdeaRow
                      idea={idea}
                      onReopen={(status) =>
                        void run(
                          () => setIdeaStatus(idea.id, status),
                          'No se pudo cambiar el estado.',
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
