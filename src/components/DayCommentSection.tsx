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
    <section className="px-4 pt-6 text-texto">
      <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">Comentario del día</h2>

      {actionError && (
        <div className="mb-2">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        <p
          className="flex items-center gap-1.5 border-b-[0.5px] border-separador px-3 py-2 text-xs font-medium text-ia-texto"
          style={{
            background:
              'linear-gradient(90deg, var(--color-ia-suave), color-mix(in srgb, var(--color-ia-suave) 55%, white))',
          }}
        >
          <SentIcon />
          Este texto se envía a la IA: el mentor lo usa en su análisis diario y semanal.
        </p>

        <div className="p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Una o dos frases sobre cómo fue el día…"
            aria-label="Comentario del día"
            disabled={busy}
            className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim() || busy || !dirty}
              className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
