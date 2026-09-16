import { useCallback, useState, type KeyboardEvent } from 'react'
import { archiveHabit, createHabit, listHabits, renameHabit } from '../data'
import { useAsyncData } from '../useAsyncData'
import HabitManageRow from './HabitManageRow'
import { ActionError, LoadError, Loading } from './ViewState'

/**
 * La pantalla "Hábitos": crear, renombrar y archivar. Tras cada cambio se
 * vuelve a leer de la nube.
 */
export default function HabitsView() {
  const fetcher = useCallback(() => listHabits(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [formOpen, setFormOpen] = useState(false)
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

  function submit() {
    const clean = name.trim()
    if (!clean || busy) return
    setName('')
    setFormOpen(false)
    void run(() => createHabit(clean), 'No se pudo crear el hábito.')
  }

  function cancelForm() {
    setName('')
    setFormOpen(false)
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const habits = data ?? []

  return (
    <main className="px-4 pb-6 pt-4 text-texto">
      <h1 className="mb-4 text-titulo">Hábitos</h1>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        {habits.length === 0 && (
          <p className="flex min-h-11 items-center border-b-[0.5px] border-separador px-3 text-texto-tenue">
            No tienes hábitos. Añade el primero abajo.
          </p>
        )}

        {habits.length > 0 && (
          <ul>
            {habits.map((h, i) => (
              <li
                key={h.id}
                className={i < habits.length - 1 ? 'border-b-[0.5px] border-separador' : ''}
              >
                <HabitManageRow
                  name={h.name}
                  onRename={(newName) =>
                    void run(() => renameHabit(h.id, newName), 'No se pudo renombrar.')
                  }
                  onArchive={() =>
                    void run(() => archiveHabit(h.id), 'No se pudo archivar.')
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {formOpen ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="Nombre del hábito…"
              aria-label="Nombre del hábito"
              autoFocus
              className="min-w-0 flex-1 rounded-campo border border-borde px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!name.trim() || busy}
              className="shrink-0 rounded-campo bg-[image:var(--grad-calido)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-calido)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-calido-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="shrink-0 rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
          >
            <span aria-hidden="true">+</span>
            <span>Añadir hábito</span>
          </button>
        )}
      </div>
    </main>
  )
}
