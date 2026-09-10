/**
 * Punto de entrada del módulo de datos.
 *
 * Los componentes importan desde aquí (`../data`). Las lecturas y escrituras de
 * hábitos, registros, deudas y pagos son `async` (van a Supabase); los helpers
 * de fechas y los derivados (`entryStatus`, `sumPayments`, `debtBalance`) son
 * síncronos.
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

export type { BackupFile, BackupData } from './backup'

export {
  exportAll,
  exportLocal,
  readLocalBackup,
  parseBackup,
  applyBackup,
  importAll,
} from './backup'

export { clearLocalData } from './storage'

export type { UploadReport, TableReport } from './migrate'

export { readLocalCounts, uploadLocalData } from './migrate'
