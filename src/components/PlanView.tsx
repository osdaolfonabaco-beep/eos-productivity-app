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

  const [formOpen, setFormOpen] = useState(false)
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
    setFormOpen(false)
    void run(() => createTask(clean, plannedFor), 'No se pudo crear la tarea.')
  }

  function cancelForm() {
    setText('')
    setFormOpen(false)
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
    <main className="px-4 pb-6 pt-4 text-texto">
      <h1 className="text-titulo">Plan</h1>
      <p className="mb-4 text-meta text-texto-tenue">Los próximos 7 días, hoy incluido.</p>

      {actionError && <ActionError message={actionError} onDismiss={() => setActionError(null)} />}

      <div className="mb-6 overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
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
              placeholder="Anota una tarea…"
              aria-label="Anota una tarea"
              autoFocus
              className="min-w-0 flex-1 rounded-campo border border-borde px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
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
            <span>Anota una tarea…</span>
          </button>
        )}
      </div>

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <LoadError onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.date}>
              <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">
                {dayLabel(day.date, today)}
              </h2>
              <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
                {day.tasks.length === 0 ? (
                  <p className="flex min-h-11 items-center px-3 text-texto-tenue">
                    Nada planificado.
                  </p>
                ) : (
                  <ul>
                    {day.tasks.map((t, i) => (
                      <li
                        key={t.id}
                        className={
                          i < day.tasks.length - 1 ? 'border-b-[0.5px] border-separador' : ''
                        }
                      >
                        <TaskRow task={t} {...rowProps(t)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
