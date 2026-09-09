import { useCallback, useEffect, useState } from 'react'
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
import HabitRow from './HabitRow'

/** El ciclo de tres estados: sin responder → hecho → no hecho → sin responder. */
const NEXT: Record<EntryStatus, EntryStatus> = {
  unanswered: 'done',
  done: 'not-done',
  'not-done': 'unanswered',
}

/** Aplica un toque: traduce el estado siguiente a la llamada de datos que toca. */
function applyCycle(habitId: string, date: string, current: EntryStatus): void {
  const next = NEXT[current]
  if (next === 'done') setEntryDone(habitId, date, true)
  else if (next === 'not-done') setEntryDone(habitId, date, false)
  else clearEntry(habitId, date)
}

/** `2026-09-08` → `Lunes, 8 de septiembre`. Solo para mostrar; el dato sigue siendo texto. */
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
 * La vista del día: la lista de hábitos de hoy y su estado.
 *
 * No guarda caché propia. Tras cada toque vuelve a leer del módulo de datos
 * (`load`) y re-renderiza, así lo que se ve es siempre lo que hay guardado.
 */
export default function DayView() {
  const today = todayISO()
  const [habits, setHabits] = useState<Habit[]>([])
  const [statuses, setStatuses] = useState<Record<string, EntryStatus>>({})

  const load = useCallback(() => {
    const active = listHabits()
    const byHabit = new Map(getEntriesForDate(today).map((e) => [e.habitId, e]))
    const next: Record<string, EntryStatus> = {}
    for (const h of active) next[h.id] = entryStatus(byHabit.get(h.id))
    setHabits(active)
    setStatuses(next)
  }, [today])

  useEffect(() => {
    load()
  }, [load])

  function cycle(habitId: string) {
    applyCycle(habitId, today, statuses[habitId] ?? 'unanswered')
    load()
  }

  return (
    <main className="px-4 py-6 text-gray-900">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Hoy</h1>
        <p className="text-sm text-gray-500">{formatToday(today)}</p>
      </header>

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
