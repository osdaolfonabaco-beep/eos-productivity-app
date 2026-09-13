/**
 * Punto de entrada del módulo de datos.
 *
 * Los componentes importan desde aquí (`../data`). Las lecturas y escrituras de
 * hábitos, registros, deudas y pagos son `async` (van a Supabase); los helpers
 * de fechas y los derivados (`entryStatus`, `sumPayments`, `debtBalance`) son
 * síncronos.
 */

export type {
  Habit,
  HabitEntry,
  EntryStatus,
  Debt,
  Payment,
  DebtStatus,
  Idea,
  IdeaStatus,
  Task,
  JournalNote,
  WeeklyGoal,
  GoalResult,
  GoalUpdate,
  GoalDirection,
  DayComment,
} from './types'

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

export {
  listIdeas,
  createIdea,
  updateIdeaText,
  setIdeaStatus,
  archiveIdea,
} from './ideas'

export type { TaskBuckets } from './tasks'

export {
  listTasks,
  createTask,
  setTaskDone,
  updateTaskText,
  archiveTask,
  bucketTasks,
} from './tasks'

export type { DayNotes } from './journal'

export {
  listTodayNotes,
  listNotesBefore,
  createNote,
  updateNoteText,
  archiveNote,
  groupNotesByDate,
  promptForDate,
} from './journal'

export {
  listWeeklyGoals,
  createWeeklyGoal,
  updateGoalText,
  setGoalResult,
  archiveGoal,
  listGoalUpdates,
  addGoalUpdate,
} from './goals'

export { getDayComment, getDayCommentsInRange, saveDayComment } from './dayComments'

export { requestAnalysis, requestWeeklyAnalysis, requestIdeaAnalysis } from './analysis'

export type { WeekRange, HabitWeekStats, HabitWeeklyBreakdown, WeeklyStats } from './weeklyStats'

export { getWeeklyHabitStats } from './weeklyStats'

export type { Tone, ReminderTimes } from './preferences'

export {
  getTone,
  setTone,
  getReminderTimes,
  setReminderSlot,
  REMINDER_SLOT_COUNT,
} from './preferences'

export {
  isPushSupported,
  getPushPermission,
  hasActiveSubscription,
  enablePushNotifications,
  sendTestPush,
} from './push'

export { clearLocalData } from './storage'

export type { UploadReport, TableReport } from './migrate'

export { readLocalCounts, uploadLocalData } from './migrate'
