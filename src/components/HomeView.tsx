import { useCallback, useState, type KeyboardEvent } from 'react'
import {
  archiveTask,
  bucketTasks,
  createTask,
  daysBetween,
  listTasks,
  setTaskDone,
  taskDueDate,
  todayISO,
  updateTaskText,
  type Task,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import AnalysisSection from './AnalysisSection'
import DayCommentSection from './DayCommentSection'
import DayPicker from './DayPicker'
import TaskRow from './TaskRow'
import TodayHabits from './TodayHabits'
import { ActionError, LoadError, Loading } from './ViewState'

/**
 * De qué día viene una tarea atrasada, discreto: "ayer", "hace N días" si es
 * reciente, o si no la fecha corta. `dueDate` es anterior a `today` siempre
 * que se llama desde aquí (son las atrasadas).
 */
function overdueLabel(dueDate: string, today: string): string {
  const diff = daysBetween(dueDate, today)
  if (diff === 1) return 'ayer'
  if (diff <= 6) return `hace ${diff} días`
  const [y, m, d] = dueDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** `2026-09-08` → `Lunes, 8 de septiembre`. Solo para mostrar. */
function formatToday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * La sección de tareas de la pantalla Hoy: alta rápida (la tarea es de hoy),
 * las de hoy y las atrasadas (días anteriores sin hacer, que se arrastran).
 * Cada fila permite marcar, editar el texto y archivar. Si no hay tareas en
 * ninguno de los dos grupos, no se muestra nada salvo el campo de alta.
 */
function TasksToday() {
  const today = todayISO()
  const fetcher = useCallback(() => listTasks(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [text, setText] = useState('')
  // `null` = hoy, el valor de siempre. Elegir otro día en el selector no toca
  // el gesto de Enter: crea para lo que esté elegido ahí en ese momento.
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
      onToggle: () =>
        void run(() => setTaskDone(t.id, !t.done), 'No se pudo actualizar.'),
      onSaveText: (next: string) =>
        void run(() => updateTaskText(t.id, next), 'No se pudo guardar.'),
      onArchive: () => void run(() => archiveTask(t.id), 'No se pudo archivar.'),
    }
  }

  const buckets = data ? bucketTasks(data, today) : null
  const hoy = buckets?.hoy ?? []
  const atrasadas = buckets?.atrasadas ?? []

  return (
    <section className="px-4 pt-6 text-gray-900">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Tareas</h2>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <div className="mb-4 flex gap-2">
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
          placeholder="Anota una tarea de hoy…"
          aria-label="Anota una tarea de hoy"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <DayPicker
          value={plannedFor}
          onChange={setPlannedFor}
          today={today}
          disabled={busy}
          label="Día de la tarea"
        />
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
      ) : hoy.length === 0 && atrasadas.length === 0 ? null : (
        <div className="flex flex-col gap-4">
          {hoy.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Hoy
              </h3>
              <ul className="flex flex-col gap-2">
                {hoy.map((t) => (
                  <li key={t.id}>
                    <TaskRow task={t} {...rowProps(t)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {atrasadas.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Atrasadas
              </h3>
              <ul className="flex flex-col gap-2">
                {atrasadas.map((t) => {
                  const due = taskDueDate(t)
                  return (
                    <li key={t.id}>
                      {due && (
                        <p className="mb-1 text-xs text-gray-400">{overdueLabel(due, today)}</p>
                      )}
                      <TaskRow task={t} {...rowProps(t)} />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * La pantalla de inicio: el título del día, los hábitos de hoy, las tareas
 * de hoy y las atrasadas, el comentario del día, y el análisis a pedido.
 * Cada bloque carga por su cuenta.
 */
export default function HomeView() {
  return (
    <main className="pb-2 text-gray-900">
      <header className="px-4 pt-4">
        <h1 className="text-2xl font-semibold">Hoy</h1>
        <p className="text-sm text-gray-500">{formatToday(todayISO())}</p>
      </header>
      <TodayHabits />
      <TasksToday />
      <DayCommentSection />
      <AnalysisSection />
    </main>
  )
}
