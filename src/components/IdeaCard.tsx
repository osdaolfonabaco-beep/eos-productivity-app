import { useState } from 'react'
import type { Idea, IdeaStatus } from '../data'

const STATUSES: { value: IdeaStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en-marcha', label: 'En marcha' },
  { value: 'descartada', label: 'Descartada' },
]

interface IdeaCardProps {
  idea: Idea
  onSetStatus: (status: IdeaStatus) => void
  onSaveText: (text: string) => void
  onArchive: () => void
}

type Mode = 'view' | 'edit' | 'confirm-archive'

/**
 * Una idea en la lista: texto, las tres pastillas de estado y las acciones
 * (editar el texto en línea, archivar con confirmación).
 */
export default function IdeaCard({
  idea,
  onSetStatus,
  onSaveText,
  onArchive,
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
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex gap-1">
            {STATUSES.map((s) => {
              const active = idea.status === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    if (!active) onSetStatus(s.value)
                  }}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-300 text-gray-600'
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
      )}
    </div>
  )
}
