import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import {
  archiveIdea,
  createIdea,
  listIdeas,
  requestIdeaAnalysis,
  setIdeaStatus,
  updateIdeaText,
  type Idea,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import IdeaCard, { type IdeaAnalysisState } from './IdeaCard'
import { ActionError, LoadError, Loading } from './ViewState'

/** Quita la clave `id` de un registro, sin tocar las demás. */
function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _drop, ...rest } = record
  return rest
}

/**
 * La pantalla "Ideas": un campo para anotar (mínima fricción) y la lista,
 * más recientes primero. Cada idea tiene sus tres pastillas de estado, edición
 * del texto en línea, archivado con confirmación, y (si no está descartada)
 * un análisis de IA a pedido.
 */
export default function IdeasView() {
  const fetcher = useCallback(() => listIdeas(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  // El análisis de IA es independiente del resto de acciones (crear/editar/
  // archivar): no se guarda en Supabase, vive aquí y se pierde al recargar.
  // Solo una idea a la vez: `analyzingId` es la que está en curso.
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analysisResults, setAnalysisResults] = useState<Record<string, IdeaAnalysisState>>({})

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
    } catch {
      setActionError(message)
      reload()
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
    if (analyzingId || idea.status === 'descartada') return
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
    <main className="px-4 py-6 text-gray-900">
      <h1 className="mb-4 text-2xl font-semibold">Ideas</h1>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <div className="mb-6">
        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          autoFocus
          placeholder="Anota una idea…"
          aria-label="Anota una idea"
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || busy}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </div>

      {ideas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
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
    </main>
  )
}
