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

interface DayData {
  habits: Habit[]
  statuses: Record<string, EntryStatus>
}

/**
 * La vista del día: la lista de hábitos de hoy y su estado.
 *
 * Al tocar, el cambio se ve al instante (parche optimista); la escritura va
 * detrás y, si falla, un `reload` revierte y aparece una franja de error.
 */
export default function DayView() {
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

  return (
    <main className="px-4 py-6 text-gray-900">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Hoy</h1>
        <p className="text-sm text-gray-500">{formatToday(today)}</p>
      </header>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {habits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
          No tienes hábitos todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {habits.map((h) => (
            <li key={h.id}>
              <HabitRow
                name={h.name}
                status={statuses[h.id] ?? 'unanswered'}
                onCycle={() => cycle(h.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
