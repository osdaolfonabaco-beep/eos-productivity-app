import { useCallback, useState, type KeyboardEvent } from 'react'
import {
  archiveTask,
  bucketTasks,
  createTask,
  listTasks,
  setTaskDone,
  todayISO,
  updateTask,
  type TaskBuckets,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import TaskRow from './TaskRow'
import { ActionError, LoadError, Loading } from './ViewState'

const GROUPS: { key: keyof TaskBuckets; label: string; showDate: boolean }[] = [
  { key: 'hoy', label: 'Hoy', showDate: false },
  { key: 'atrasadas', label: 'Atrasadas', showDate: true },
  { key: 'proximas', label: 'Próximas', showDate: true },
  { key: 'sinFecha', label: 'Sin fecha', showDate: false },
]

/**
 * Vida → Tareas: captura arriba y las tareas repartidas en los cuatro grupos.
 * Los grupos vacíos no se muestran.
 */
export default function TasksView() {
  const today = todayISO()
  const fetcher = useCallback(() => listTasks(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [text, setText] = useState('')
  const [date, setDate] = useState('')
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
    const clean = text.trim()
    if (!clean || busy) return
    const d = date || null
    setText('')
    setDate('')
    void run(() => createTask(clean, d), 'No se pudo crear la tarea.')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const tasks = data ?? []
  const buckets = bucketTasks(tasks, today)

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <div className="mb-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Escribe una tarea…"
          aria-label="Escribe una tarea"
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Fecha de la tarea (opcional)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || busy}
            className="ml-auto rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
          No tienes tareas.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map(({ key, label, showDate }) => {
            const group = buckets[key]
            if (group.length === 0) return null
            return (
              <section key={key}>
                <h2 className="mb-2 text-sm font-semibold text-gray-700">{label}</h2>
                <ul className="flex flex-col gap-2">
                  {group.map((t) => (
                    <li key={t.id}>
                      <TaskRow
                        task={t}
                        showDate={showDate}
                        onToggle={() =>
                          void run(
                            () => setTaskDone(t.id, !t.done),
                            'No se pudo actualizar.',
                          )
                        }
                        onSaveEdit={(patch) =>
                          void run(() => updateTask(t.id, patch), 'No se pudo guardar.')
                        }
                        onArchive={() =>
                          void run(() => archiveTask(t.id), 'No se pudo archivar.')
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
