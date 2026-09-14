import { useState } from 'react'
import type { Idea, IdeaStatus } from '../data'

export const STATUSES: { value: IdeaStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en-marcha', label: 'En marcha' },
  { value: 'descartada', label: 'Descartada' },
  { value: 'hecha', label: 'Hecha' },
]

/**
 * Color de cada pastilla cuando está activa. 'hecha' y 'descartada' son
 * desenlaces opuestos y llevan colores que no se confunden entre sí (verde
 * vs. rosa); pendiente/en-marcha, al no ser un desenlace, comparten el color
 * neutro de siempre.
 */
export const STATUS_ACTIVE_CLASS: Record<IdeaStatus, string> = {
  pendiente: 'bg-gray-900 text-white',
  'en-marcha': 'bg-gray-900 text-white',
  descartada: 'bg-rose-600 text-white',
  hecha: 'bg-emerald-600 text-white',
}

/** El resultado de pedir el análisis de IA de esta idea, o `undefined` si nunca se pidió. */
export type IdeaAnalysisState = { text: string } | { error: string }

interface IdeaCardProps {
  idea: Idea
  onSetStatus: (status: IdeaStatus) => void
  onSaveText: (text: string) => void
  onArchive: () => void
  /** `true` mientras se espera la respuesta del análisis de ESTA idea. */
  analyzing: boolean
  /** `true` si hay otra idea analizándose ahora mismo (solo una a la vez). */
  analyzeDisabled: boolean
  analysisResult: IdeaAnalysisState | undefined
  onAnalyze: () => void
}

type Mode = 'view' | 'edit' | 'confirm-archive' | 'confirm-hecha'

/**
 * Una idea en la lista: texto, las cuatro pastillas de estado, las acciones
 * (editar el texto en línea, archivar con confirmación) y, en pendiente/en
 * marcha, el botón de análisis con IA y su resultado (o error) debajo.
 *
 * Marcar como 'hecha' pide confirmación de dos toques, igual que archivar
 * (y de hecho archiva: ver `setIdeaStatus`) -- las demás pastillas cambian
 * el estado al primer toque, como siempre.
 */
export default function IdeaCard({
  idea,
  onSetStatus,
  onSaveText,
  onArchive,
  analyzing,
  analyzeDisabled,
  analysisResult,
  onAnalyze,
}: IdeaCardProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(idea.text)

  function save() {
    const clean = draft.trim()
    if (!clean) return
    onSaveText(clean)
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          aria-label="Texto de la idea"
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(idea.text)
              setMode('view')
            }}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  const discarded = idea.status === 'descartada'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p
        className={`whitespace-pre-wrap break-words ${
          discarded ? 'text-gray-400' : 'text-gray-900'
        }`}
      >
        {idea.text}
      </p>

      {mode === 'confirm-archive' ? (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm text-gray-700">
            Se archivará: sale de la lista pero se conserva.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onArchive}
              className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white"
            >
              Archivar
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : mode === 'confirm-hecha' ? (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-sm text-gray-700">
            Se marcará como hecha: sale de la lista y se archiva. Se puede volver atrás
            desde "Ver archivadas".
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onSetStatus('hecha')}
              className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white"
            >
              Marcar como hecha
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex gap-1">
              {STATUSES.map((s) => {
                const active = idea.status === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      if (active) return
                      if (s.value === 'hecha') {
                        setMode('confirm-hecha')
                      } else {
                        onSetStatus(s.value)
                      }
                    }}
                    aria-pressed={active}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      active ? STATUS_ACTIVE_CLASS[s.value] : 'border border-gray-300 text-gray-600'
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            <div className="ml-auto flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(idea.text)
                  setMode('edit')
                }}
                className="text-sm font-medium text-gray-500"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setMode('confirm-archive')}
                className="text-sm font-medium text-gray-500"
              >
                Archivar
              </button>
            </div>
          </div>

          {!discarded && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={onAnalyze}
                disabled={analyzing || analyzeDisabled}
                className="text-sm font-medium text-indigo-700 disabled:opacity-40"
              >
                {analyzing ? 'Analizando…' : 'Analizar con IA'}
              </button>

              {analysisResult && 'text' in analysisResult && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                  {analysisResult.text}
                </p>
              )}

              {analysisResult && 'error' in analysisResult && (
                <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                  <p>{analysisResult.error}</p>
                  <button
                    type="button"
                    onClick={onAnalyze}
                    disabled={analyzing || analyzeDisabled}
                    className="mt-2 text-sm font-medium underline disabled:opacity-40"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
