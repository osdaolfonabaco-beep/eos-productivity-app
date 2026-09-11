import { useCallback, useState } from 'react'
import {
  archiveNote,
  createNote,
  groupNotesByDate,
  listNotesBefore,
  listTodayNotes,
  promptForDate,
  todayISO,
  updateNoteText,
  type JournalNote,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, LoadError, Loading } from './ViewState'

/** `2026-09-08` → `Lunes, 8 de septiembre`. Solo para mostrar. */
function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Navegación interna: lista, escribir una nota nueva, o editar una de hoy. */
type Screen = { name: 'list' } | { name: 'compose' } | { name: 'edit'; note: JournalNote }

interface JournalData {
  today: JournalNote[]
  past: JournalNote[]
}

/** Una nota de un día anterior: solo lectura, con archivar en dos toques. */
function PastNote({
  label,
  note,
  onArchive,
}: {
  label: string
  note: JournalNote
  onArchive: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-sm font-medium text-gray-500"
          >
            Archivar
          </button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-gray-800">{note.text}</p>

      {confirming && (
        <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm text-gray-700">
            Se archivará: sale de la lista, el texto se conserva.
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
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * El editor: pantalla propia para escribir una nota nueva o cambiar el texto
 * de una de hoy. La pregunta sugerida solo aparece al crear, no al editar.
 */
function NoteEditor({
  initialText,
  prompt,
  busy,
  onSave,
  onCancel,
}: {
  initialText: string
  prompt: string | null
  busy: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)

  function save() {
    const clean = text.trim()
    if (!clean || busy) return
    onSave(clean)
  }

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      <button type="button" onClick={onCancel} className="mb-3 text-sm text-gray-600">
        ‹ Volver
      </button>

      {prompt && <p className="mb-2 text-sm italic text-gray-500">{prompt}</p>}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        autoFocus
        placeholder="Escribe tu nota…"
        aria-label="Texto de la nota"
        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || busy}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </main>
  )
}

/**
 * Vida → Journal: la lista de notas de hoy (numeradas, tocar una para
 * editarla) con un botón para añadir, y debajo las de días anteriores,
 * de solo lectura, agrupadas por día y también numeradas.
 */
export default function JournalView() {
  const today = todayISO()
  const [screen, setScreen] = useState<Screen>({ name: 'list' })

  const fetcher = useCallback(async (): Promise<JournalData> => {
    const [todayNotes, pastNotes] = await Promise.all([
      listTodayNotes(today),
      listNotesBefore(today),
    ])
    return { today: todayNotes, past: pastNotes }
  }, [today])

  const { data, loading, error, reload } = useAsyncData(fetcher, [today])

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, message: string, backToList = false) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      if (backToList) setScreen({ name: 'list' })
      reload()
    } catch {
      setActionError(message)
    } finally {
      setBusy(false)
    }
  }

  if (screen.name === 'compose' || screen.name === 'edit') {
    const editing = screen.name === 'edit' ? screen.note : null
    return (
      <NoteEditor
        initialText={editing?.text ?? ''}
        prompt={editing ? null : promptForDate(today)}
        busy={busy}
        onCancel={() => setScreen({ name: 'list' })}
        onSave={(text) =>
          void run(
            () => (editing ? updateNoteText(editing.id, text) : createNote(today, text)),
            'No se pudo guardar.',
            true,
          )
        }
      />
    )
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const todayNotes = data?.today ?? []
  const pastDays = groupNotesByDate(data?.past ?? [])

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <button
        type="button"
        onClick={() => setScreen({ name: 'compose' })}
        className="mb-6 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white"
      >
        + Nueva nota
      </button>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Hoy</h2>
        {todayNotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
            Aún no has anotado nada hoy.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {todayNotes.map((note, i) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setScreen({ name: 'edit', note })}
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left"
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Nota {i + 1}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-gray-900">{note.text}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastDays.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Entradas anteriores</h2>
          <ul className="flex flex-col gap-4">
            {pastDays.map((day) => (
              <li key={day.date} className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  {formatLongDate(day.date)}
                </p>
                <ul className="flex flex-col gap-3">
                  {day.notes.map((note, i) => (
                    <PastNote
                      key={note.id}
                      label={`Nota ${i + 1}`}
                      note={note}
                      onArchive={() => void run(() => archiveNote(note.id), 'No se pudo archivar.')}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
