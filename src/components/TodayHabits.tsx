import { useCallback, useState } from 'react'
import {
  clearEntry,
  entryStatus,
  getEntriesForDate,
  listHabits,
  setEntryDone,
  todayISO,
  type EntryStatus,
  type Habit,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import HabitRow from './HabitRow'
import { ActionError, LoadError, Loading } from './ViewState'

/** El ciclo de tres estados: sin responder → hecho → no hecho → sin responder. */
const NEXT: Record<EntryStatus, EntryStatus> = {
  unanswered: 'done',
  done: 'not-done',
  'not-done': 'unanswered',
}

/** Aplica un toque: traduce el estado siguiente a la escritura que toca. */
async function applyCycle(
  habitId: string,
  date: string,
  current: EntryStatus,
): Promise<void> {
  const next = NEXT[current]
  if (next === 'done') await setEntryDone(habitId, date, true)
  else if (next === 'not-done') await setEntryDone(habitId, date, false)
  else await clearEntry(habitId, date)
}

interface DayData {
  habits: Habit[]
  statuses: Record<string, EntryStatus>
}

/**
 * Los hábitos de hoy y su estado, como sección de la pantalla Hoy (`HomeView`
 * pone el título y la fecha).
 *
 * Al tocar, el cambio se ve al instante (parche optimista); la escritura va
 * detrás y, si falla, un `reload` revierte y aparece una franja de error.
 */
export default function TodayHabits() {
  const today = todayISO()

  const fetcher = useCallback(async (): Promise<DayData> => {
    const [habits, entries] = await Promise.all([
      listHabits(),
      getEntriesForDate(today),
    ])
    const byHabit = new Map(entries.map((e) => [e.habitId, e]))
    const statuses: Record<string, EntryStatus> = {}
    for (const h of habits) statuses[h.id] = entryStatus(byHabit.get(h.id))
    return { habits, statuses }
  }, [today])

  const { data, loading, error, reload, patch } = useAsyncData(fetcher, [today])
  const [actionError, setActionError] = useState<string | null>(null)

  async function cycle(habitId: string) {
    if (!data) return
    const current = data.statuses[habitId] ?? 'unanswered'
    const next = NEXT[current]
    patch({ ...data, statuses: { ...data.statuses, [habitId]: next } })
    try {
      await applyCycle(habitId, today, current)
      reload()
    } catch {
      setActionError('No se pudo guardar el cambio.')
      reload()
    }
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const habits = data?.habits ?? []
  const statuses = data?.statuses ?? {}
  const hechos = habits.filter((h) => statuses[h.id] === 'done').length

  return (
    <section className="px-4 pt-3 text-texto">
      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {habits.length === 0 ? (
        <p className="rounded-tarjeta border border-dashed border-borde px-4 py-8 text-center text-texto-apagado">
          No tienes hábitos todavía.
        </p>
      ) : (
        <>
          <p className="mb-2 text-etiqueta uppercase text-texto-tenue">
            Hábitos · {hechos} de {habits.length}
          </p>
          <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
            <ul>
              {habits.map((h, i) => (
                <li
                  key={h.id}
                  className={i < habits.length - 1 ? 'border-b-[0.5px] border-separador' : ''}
                >
                  <HabitRow
                    name={h.name}
                    status={statuses[h.id] ?? 'unanswered'}
                    onCycle={() => cycle(h.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
