import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import {
  archiveIdea,
  createIdea,
  listIdeas,
  setIdeaStatus,
  updateIdeaText,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import IdeaCard from './IdeaCard'
import { ActionError, LoadError, Loading } from './ViewState'

/**
 * La pantalla "Ideas": un campo para anotar (mínima fricción) y la lista,
 * más recientes primero. Cada idea tiene sus tres pastillas de estado, edición
 * del texto en línea y archivado con confirmación.
 */
export default function IdeasView() {
  const fetcher = useCallback(() => listIdeas(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

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
                  void run(() => updateIdeaText(idea.id, t), 'No se pudo guardar el texto.')
                }
                onArchive={() =>
                  void run(() => archiveIdea(idea.id), 'No se pudo archivar.')
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
