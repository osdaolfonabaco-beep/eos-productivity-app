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
 * La sección de tareas de la pantalla Hoy: las atrasadas (días anteriores sin
 * hacer, que se arrastran) primero, luego las de hoy, y al final la línea de
 * alta rápida (la tarea es de hoy salvo que se elija otro día en el selector).
 * Cada fila permite marcar, editar el texto y archivar. El contenedor se
 * muestra siempre, aunque no haya tareas: la línea de alta siempre está.
 */
function TasksToday() {
  const today = todayISO()
  const fetcher = useCallback(() => listTasks(), [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [formOpen, setFormOpen] = useState(false)
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
    setFormOpen(false)
    void run(() => createTask(clean, plannedFor), 'No se pudo crear la tarea.')
  }

  function cancelForm() {
    setText('')
    setFormOpen(false)
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
  // Atrasadas primero (con su franja roja y su etiqueta de antigüedad), luego
  // las de hoy: el orden ya distingue los dos grupos, sin subcabeceras.
  const rows = [
    ...atrasadas.map((t) => ({ task: t, overdueLabel: overdueLabel(taskDueDate(t)!, today) })),
    ...hoy.map((t) => ({ task: t, overdueLabel: undefined })),
  ]

  return (
    <section className="px-4 pt-6 text-texto">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Tareas de hoy</h2>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <LoadError onRetry={reload} />
      ) : (
        <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
          <ul>
            {rows.map(({ task: t, overdueLabel: label }) => (
              <li key={t.id} className="border-b-[0.5px] border-separador">
                <TaskRow task={t} variant="row" overdueLabel={label} {...rowProps(t)} />
              </li>
            ))}
            <li>
              {formOpen ? (
                <div className="flex flex-wrap items-center gap-2 px-3 py-3">
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
                    autoFocus
                    className="min-w-0 flex-1 rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
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
                    className="shrink-0 rounded-campo bg-texto px-4 py-2 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
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
                  <span>Anota una tarea…</span>
                </button>
              )}
            </li>
          </ul>
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
