import { useCallback, useEffect, useRef, useState } from 'react'
import { getDayComment, saveDayComment, todayISO, type DayComment } from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, LoadError, Loading } from './ViewState'

/** Flecha saliente: "esto se va de aquí". El mismo criterio de icono a mano que el resto de la app. */
function SentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7M17 7H9M17 7V15" />
    </svg>
  )
}

interface DayCommentData {
  comment: DayComment | undefined
}

/**
 * Una o dos frases sobre cómo fue el día, debajo de las tareas en Hoy. Uno
 * por día, solo el de hoy es editable. A diferencia del journal, este texto
 * SÍ se manda a la IA (análisis diario y semanal) — de ahí el aviso junto al
 * campo, para que nunca sea una sorpresa.
 */
export default function DayCommentSection() {
  const today = todayISO()
  const fetcher = useCallback(async (): Promise<DayCommentData> => {
    return { comment: await getDayComment(today) }
  }, [today])

  const { data, loading, error, reload } = useAsyncData(fetcher, [today])

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (data && !initialized.current) {
      setText(data.comment?.text ?? '')
      initialized.current = true
    }
  }, [data])

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const saved = data?.comment?.text ?? ''
  const dirty = text.trim() !== saved

  async function save() {
    const clean = text.trim()
    if (!clean || busy || !dirty) return
    setBusy(true)
    setActionError(null)
    try {
      await saveDayComment(today, clean)
      setText(clean)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="px-4 pt-6 text-gray-900">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Comentario del día</h2>

      {actionError && (
        <div className="mb-2">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-indigo-700">
        <SentIcon />
        Se envía a la IA en el análisis diario y semanal.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Una o dos frases sobre cómo fue el día…"
        aria-label="Comentario del día"
        disabled={busy}
        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!text.trim() || busy || !dirty}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </section>
  )
}
