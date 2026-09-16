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
  JournalKey,
  WeeklyGoal,
  GoalResult,
  GoalUpdate,
  GoalDirection,
  DayComment,
  Quincena,
  SalaryPeriod,
  FixedExpenseCadence,
  FixedExpense,
  SavingsGoal,
  SavingsContribution,
  Income,
  Expense,
} from './types'

export {
  isISODate,
  toISODate,
  todayISO,
  addDays,
  daysBetween,
  startOfWeekISO,
  quincenaLabel,
  quincenaRange,
} from './dates'

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
  listArchivedIdeas,
  listClosedIdeas,
  createIdea,
  updateIdeaText,
  setIdeaStatus,
  archiveIdea,
} from './ideas'

export type { TaskBuckets, PlannedDay } from './tasks'

export {
  listTasks,
  createTask,
  setTaskDone,
  updateTaskText,
  setTaskPlannedFor,
  archiveTask,
  bucketTasks,
  groupTasksByWindow,
  planningWindow,
  taskDueDate,
} from './tasks'

export type { DayNotes, NoteContent } from './journal'

export {
  listTodayNotes,
  listNotesBefore,
  createNote,
  updateNoteContent,
  archiveNote,
  groupNotesByDate,
  promptForDate,
} from './journal'

export { getJournalKey, insertJournalKey, updatePasswordWrapping } from './journalKey'

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

export type { PeriodBreakdown } from './salaryPeriods'

export { getSalaryPeriod, setSalaryAmount, getPeriodBreakdown } from './salaryPeriods'

export type { FixedExpenseInput } from './fixedExpenses'

export {
  listFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  archiveFixedExpense,
  fixedExpenseCadence,
  appliesToQuincena,
  fixedExpensesForQuincena,
  sumFixedExpenses,
} from './fixedExpenses'

export type { SavingsGoalInput } from './savingsGoal'

export {
  getActiveSavingsGoal,
  createSavingsGoal,
  updateSavingsGoal,
  archiveSavingsGoal,
} from './savingsGoal'

export {
  listContributions,
  addContribution,
  archiveContribution,
  sumContributions,
  savingsProgress,
} from './savingsContributions'

export type { IncomeInput } from './incomes'

export { listIncomes, createIncome, updateIncome, archiveIncome, sumIncomes } from './incomes'

export type { ExpenseInput } from './expenses'

export {
  listExpenses,
  createExpense,
  updateExpense,
  archiveExpense,
  sumExpenses,
  fixedExpenseIdsWithExpenseInRange,
} from './expenses'
