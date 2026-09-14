import { useCallback, useState, type KeyboardEvent } from 'react'
import {
  archiveTask,
  createTask,
  groupTasksByWindow,
  listTasks,
  setTaskDone,
  setTaskPlannedFor,
  todayISO,
  updateTaskText,
  type Task,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import DayPicker, { dayLabel } from './DayPicker'
import TaskRow from './TaskRow'
import { ActionError, LoadError, Loading } from './ViewState'

/**
 * Vida → Plan: los próximos 7 días (hoy incluido), cada uno con lo que tiene
 * planificado. Alta rápida arriba con el día a elegir; cada tarea se puede
 * mover a otro día de la ventana. Fuera de la ventana no hay nada que ver:
 * no es un calendario.
 */
export default function PlanView() {
  const today = todayISO()
  const fetcher = useCallback(() => listTasks(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [text, setText] = useState('')
  const [plannedFor, setPlannedFor] = useState<string | null>(null)
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
    setText('')
    void run(() => createTask(clean, plannedFor), 'No se pudo crear la tarea.')
  }

  function rowProps(t: Task) {
    return {
      onToggle: () => void run(() => setTaskDone(t.id, !t.done), 'No se pudo actualizar.'),
      onSaveText: (next: string) =>
        void run(() => updateTaskText(t.id, next), 'No se pudo guardar.'),
      onArchive: () => void run(() => archiveTask(t.id), 'No se pudo archivar.'),
      onMove: (next: string | null) =>
        void run(() => setTaskPlannedFor(t.id, next), 'No se pudo mover.'),
    }
  }

  const days = groupTasksByWindow(data ?? [], today)

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      <h1 className="mb-1 text-xl font-semibold">Plan</h1>
      <p className="mb-4 text-sm text-gray-500">Los próximos 7 días, hoy incluido.</p>

      {actionError && <ActionError message={actionError} onDismiss={() => setActionError(null)} />}

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Anota una tarea…"
          aria-label="Anota una tarea"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <DayPicker value={plannedFor} onChange={setPlannedFor} today={today} label="Día de la tarea" />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || busy}
          className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Guardar
        </button>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <LoadError onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.date}>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                {dayLabel(day.date, today)}
              </h2>
              {day.tasks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  Nada planificado.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {day.tasks.map((t) => (
                    <li key={t.id}>
                      <TaskRow task={t} {...rowProps(t)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
