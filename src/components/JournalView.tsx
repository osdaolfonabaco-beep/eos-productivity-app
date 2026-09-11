import { useCallback, useEffect, useRef, useState } from 'react'
import {
  archiveJournalEntry,
  getJournalEntry,
  listJournalEntriesBefore,
  promptForDate,
  saveJournalEntry,
  todayISO,
  type JournalEntry,
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

interface JournalData {
  today: JournalEntry | undefined
  past: JournalEntry[]
}

/** Una entrada pasada: solo lectura, con archivar en dos toques. */
function PastEntry({ entry, onArchive }: { entry: JournalEntry; onArchive: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">{formatLongDate(entry.date)}</p>
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
      <p className="mt-1 whitespace-pre-wrap break-words text-gray-800">{entry.text}</p>

      {confirming && (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
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
 * Vida → Journal: la entrada de hoy (editable, se reescribe con "Guardar") y
 * las anteriores debajo, de solo lectura con archivar.
 */
export default function JournalView() {
  const today = todayISO()
  const prompt = promptForDate(today)

  const fetcher = useCallback(async (): Promise<JournalData> => {
    const [entry, past] = await Promise.all([
      getJournalEntry(today),
      listJournalEntriesBefore(today),
    ])
    return { today: entry, past }
  }, [today])

  const { data, loading, error, reload } = useAsyncData(fetcher, [today])

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (data && !initialized.current) {
      setText(data.today?.text ?? '')
      initialized.current = true
    }
  }, [data])

  async function run(action: () => Promise<unknown>, message: string, onSuccess?: () => void) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      onSuccess?.()
      reload()
    } catch {
      setActionError(message)
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const clean = text.trim()
    if (!clean || busy) return
    void run(() => saveJournalEntry(today, clean), 'No se pudo guardar.', () => setText(clean))
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const past = data?.past ?? []
  const savedText = data?.today?.text ?? ''
  const dirty = text.trim() !== savedText

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <p className="mb-2 text-sm italic text-gray-500">{prompt}</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Escribe lo que quieras de hoy…"
        aria-label="Entrada de hoy"
        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || busy || !dirty}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Entradas anteriores</h2>
          <ul className="flex flex-col gap-3">
            {past.map((entry) => (
              <PastEntry
                key={entry.id}
                entry={entry}
                onArchive={() =>
                  void run(() => archiveJournalEntry(entry.id), 'No se pudo archivar.')
                }
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
