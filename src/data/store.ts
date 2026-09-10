/**
 * El módulo de datos de hábitos.
 *
 * Ningún componente lee ni escribe `localStorage` directamente: pasa por aquí,
 * y el acceso crudo vive en `storage.ts`. No guarda estado en memoria: cada
 * lectura vuelve a `localStorage`, así que es siempre la única fuente de verdad.
 */

import { isISODate } from './dates'
import { newId, readList, writeList } from './storage'
import type { EntryStatus, Habit, HabitEntry } from './types'

const HABITS_KEY = 'productividad.habits'
const ENTRIES_KEY = 'productividad.entries'

// --- Hábitos -------------------------------------------------------------

/** Todos los hábitos, archivados incluidos, ordenados por `order`. Uso interno. */
function allHabits(): Habit[] {
  return readList<Habit>(HABITS_KEY).sort((a, b) => a.order - b.order)
}

/** Los hábitos activos (no archivados), ordenados por `order`. */
export function listHabits(): Habit[] {
  return allHabits().filter((h) => !h.archived)
}

/** Un hábito por id, o `undefined` si no existe. Incluye los archivados. */
export function getHabit(id: string): Habit | undefined {
  return allHabits().find((h) => h.id === id)
}

/**
 * Crea un hábito activo. `name` se recorta; si queda vacío, lanza error.
 * El hábito nuevo va al final de la lista: `order = (máximo actual) + 1`.
 */
export function createHabit(name: string): Habit {
  const clean = name.trim()
  if (!clean) throw new Error('El nombre del hábito no puede estar vacío')

  const habits = allHabits()
  const maxOrder = habits.reduce((max, h) => Math.max(max, h.order), -1)
  const habit: Habit = {
    id: newId(),
    name: clean,
    createdAt: new Date().toISOString(),
    archived: false,
    order: maxOrder + 1,
  }
  writeList(HABITS_KEY, [...habits, habit])
  return habit
}

/**
 * Renombra un hábito. Es lo único editable de un hábito en la v1.
 * No toca ningún `HabitEntry`: los registros pasados siguen siendo válidos
 * aunque el hábito cambie de nombre.
 */
export function renameHabit(id: string, name: string): Habit {
  const clean = name.trim()
  if (!clean) throw new Error('El nombre del hábito no puede estar vacío')

  const habits = allHabits()
  const habit = habits.find((h) => h.id === id)
  if (!habit) throw new Error(`No existe el hábito ${id}`)

  const updated: Habit = { ...habit, name: clean }
  writeList(
    HABITS_KEY,
    habits.map((h) => (h.id === id ? updated : h)),
  )
  return updated
}

/**
 * Archiva un hábito. Esto es lo que hace por dentro el botón "Eliminar" de la
 * interfaz: el hábito y sus registros se conservan, solo deja de aparecer en
 * las listas activas. Idempotente: archivar uno ya archivado no hace nada.
 */
export function archiveHabit(id: string): void {
  const habits = allHabits()
  const habit = habits.find((h) => h.id === id)
  if (!habit) throw new Error(`No existe el hábito ${id}`)
  if (habit.archived) return

  writeList(
    HABITS_KEY,
    habits.map((h) => (h.id === id ? { ...h, archived: true } : h)),
  )
}

// --- Registros diarios -------------------------------------------------

/** Todos los registros, sin ordenar. Uso interno. */
function allEntries(): HabitEntry[] {
  return readList<HabitEntry>(ENTRIES_KEY)
}

/**
 * El registro de un hábito en una fecha, o `undefined` si ese día está sin
 * responder.
 */
export function getEntry(habitId: string, date: string): HabitEntry | undefined {
  return allEntries().find((e) => e.habitId === habitId && e.date === date)
}

/** Todos los registros de una fecha, de todos los hábitos. Para la vista del día. */
export function getEntriesForDate(date: string): HabitEntry[] {
  return allEntries().filter((e) => e.date === date)
}

/**
 * Todos los registros entre `startDate` y `endDate` (formato `YYYY-MM-DD`),
 * ambos extremos incluidos. Para la cuadrícula de la semana.
 *
 * Compara las fechas como texto: en formato `YYYY-MM-DD` el orden alfabético
 * coincide con el cronológico.
 */
export function getEntriesInRange(startDate: string, endDate: string): HabitEntry[] {
  return allEntries().filter((e) => e.date >= startDate && e.date <= endDate)
}

/**
 * Fija si un hábito se cumplió (`done`) o no en una fecha.
 * Si ya había registro para ese (hábito, día), actualiza su `done`; si no, lo crea.
 *
 * Esto no rompe la inmutabilidad del historial: lo inmutable es que editar el
 * hábito no toca sus registros. Marcar y desmarcar un día es la función central
 * de la app.
 */
export function setEntryDone(habitId: string, date: string, done: boolean): HabitEntry {
  if (!isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }

  const entries = allEntries()
  const existing = entries.find((e) => e.habitId === habitId && e.date === date)

  if (existing) {
    const updated: HabitEntry = { ...existing, done }
    writeList(
      ENTRIES_KEY,
      entries.map((e) => (e === existing ? updated : e)),
    )
    return updated
  }

  const entry: HabitEntry = { id: newId(), habitId, date, done }
  writeList(ENTRIES_KEY, [...entries, entry])
  return entry
}

/**
 * Borra el registro de un hábito en una fecha: ese día vuelve a "sin responder".
 * Es la única forma de volver al tercer estado. Si no había registro, no hace nada.
 */
export function clearEntry(habitId: string, date: string): void {
  const entries = allEntries()
  const next = entries.filter((e) => !(e.habitId === habitId && e.date === date))
  if (next.length !== entries.length) {
    writeList(ENTRIES_KEY, next)
  }
}

/**
 * Traduce un registro (o su ausencia) a los tres estados que distingue la
 * interfaz. Pásale el resultado de `getEntry`, o el valor de un `Map` construido
 * a partir de `getEntriesForDate` / `getEntriesInRange`.
 */
export function entryStatus(entry: HabitEntry | undefined): EntryStatus {
  if (!entry) return 'unanswered'
  return entry.done ? 'done' : 'not-done'
}
