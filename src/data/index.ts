/**
 * Punto de entrada del módulo de datos.
 *
 * Los componentes importan desde aquí (`../data`), nunca de los archivos
 * internos y nunca de `localStorage`.
 */

export type { Habit, HabitEntry, EntryStatus, Debt, Payment, DebtStatus } from './types'

export { isISODate, toISODate, todayISO, addDays, startOfWeekISO } from './dates'

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

export type { DebtInput } from './finance'

export {
  listDebts,
  getDebt,
  createDebt,
  updateDebt,
  archiveDebt,
  getPayments,
  addPayment,
  deletePayment,
  sumPayments,
  debtBalance,
} from './finance'
