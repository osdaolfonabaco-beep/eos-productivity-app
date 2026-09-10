import { useCallback, useState, type FormEvent } from 'react'
import { archiveHabit, createHabit, listHabits, renameHabit } from '../data'
import { useAsyncData } from '../useAsyncData'
import HabitManageRow from './HabitManageRow'
import { ActionError, LoadError, Loading } from './ViewState'

/**
 * La pantalla "Hábitos": crear, renombrar y eliminar (archivar).
 * Tras cada cambio se vuelve a leer de la nube.
 */
export default function HabitsView() {
  const fetcher = useCallback(() => listHabits(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  function add(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || busy) return
    setName('')
    void run(() => createHabit(clean), 'No se pudo crear el hábito.')
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const habits = data ?? []

  return (
    <main className="px-4 py-6 text-gray-900">
      <h1 className="mb-4 text-2xl font-semibold">Hábitos</h1>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <form onSubmit={add} className="mb-6 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del hábito…"
          aria-label="Nombre del hábito"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="shrink-0 rounded-lg bg-gray-900 px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          Añadir
        </button>
      </form>

      {habits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
          No tienes hábitos. Añade el primero arriba.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {habits.map((h) => (
            <li key={h.id}>
              <HabitManageRow
                name={h.name}
                onRename={(newName) =>
                  void run(() => renameHabit(h.id, newName), 'No se pudo renombrar.')
                }
                onDelete={() =>
                  void run(() => archiveHabit(h.id), 'No se pudo eliminar.')
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
