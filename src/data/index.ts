/**
 * Punto de entrada del módulo de datos.
 *
 * Los componentes importan desde aquí (`../data`), nunca de los archivos
 * internos y nunca de `localStorage`.
 */

export type { Habit, HabitEntry, EntryStatus } from './types'

export { isISODate, toISODate, todayISO, addDays } from './dates'

export {
  listHabits,
  getHabit,
  createHabit,
  renameHabit,
  archiveHabit,
  getEntry,
  getEntriesForDate,
  getEntriesInRange,
  setEntryDone,
  clearEntry,
  entryStatus,
} from './store'
