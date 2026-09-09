import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { archiveHabit, createHabit, listHabits, renameHabit, type Habit } from '../data'
import HabitManageRow from './HabitManageRow'

/**
 * La pantalla "Hábitos": crear, renombrar y eliminar (archivar).
 *
 * Mismo patrón sin caché que `DayView`: tras cada cambio vuelve a leer del
 * módulo de datos con `load` y re-renderiza.
 */
export default function HabitsView() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [name, setName] = useState('')

  const load = useCallback(() => {
    setHabits(listHabits())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function add(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    createHabit(clean)
    setName('')
    load()
  }

  return (
    <main className="px-4 py-6 text-gray-900">
      <h1 className="mb-4 text-2xl font-semibold">Hábitos</h1>

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
          disabled={!name.trim()}
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
                onRename={(newName) => {
                  renameHabit(h.id, newName)
                  load()
                }}
                onDelete={() => {
                  archiveHabit(h.id)
                  load()
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
