/**
 * Traducción entre las filas de Supabase (snake_case) y las entidades de la app
 * (camelCase). El resto del código sigue viendo `Habit`, `HabitEntry`, `Debt` y
 * `Payment` sin enterarse de la base de datos.
 *
 * `user_id` y `updated_at` los maneja el servidor (default `auth.uid()` y
 * trigger); nunca se envían ni se leen aquí.
 */

import type {
  DayComment,
  Debt,
  DebtStatus,
  Expense,
  FixedExpense,
  GoalDirection,
  GoalResult,
  GoalUpdate,
  Habit,
  HabitEntry,
  Idea,
  IdeaStatus,
  Income,
  JournalKey,
  JournalNote,
  MentorAnalysis,
  MentorAnalysisType,
  MentorSummary,
  Payment,
  Quincena,
  SalaryPeriod,
  SavingsContribution,
  SavingsGoal,
  Task,
  WeeklyGoal,
} from './types'
import type { JournalKeyWrapping } from '../lib/journalCrypto'
import type { Tone } from './preferences'

export const HABIT_COLS = 'id,name,archived,sort_order,created_at'
export const ENTRY_COLS = 'id,habit_id,date,done'
export const DEBT_COLS =
  'id,name,opening_balance,annual_rate,monthly_payment,status,archived,sort_order,created_at'
export const PAYMENT_COLS = 'id,debt_id,date,amount'
export const IDEA_COLS = 'id,text,status,created_at,archived,closed_at'
export const TASK_COLS = 'id,text,date,planned_for,done,archived,created_at'
export const JOURNAL_COLS = 'id,date,text,ciphertext,iv,encrypted,created_at,archived'
export const GOAL_COLS = 'id,week_start,text,resultado,archived,created_at'
export const GOAL_UPDATE_COLS = 'id,goal_id,date,text,direction,created_at'
export const DAY_COMMENT_COLS = 'id,date,text,created_at'
export const SALARY_PERIOD_COLS = 'id,period_start,period_end,amount,archived,created_at'
export const FIXED_EXPENSE_COLS = 'id,name,amount,quincena,archived,created_at'
export const SAVINGS_GOAL_COLS = 'id,name,target_amount,target_date,archived,created_at'
export const SAVINGS_CONTRIBUTION_COLS = 'id,goal_id,date,amount,archived,created_at'
export const INCOME_COLS = 'id,date,amount,category,note,archived,created_at'
export const EXPENSE_COLS =
  'id,date,amount,concept,category,note,fixed_expense_id,archived,created_at'
export const MENTOR_ANALYSIS_COLS =
  'id,tipo,period_start,period_end,tono,incluyo_dinero,contenido,archived,created_at'
export const MENTOR_SUMMARY_COLS = 'id,contenido,previous_contenido,created_at,updated_at'
export const JOURNAL_KEY_COLS =
  'id,wrapped_dek_password,salt_password,iv_password,wrapped_dek_recovery,salt_recovery,iv_recovery,created_at,updated_at'

interface HabitRow {
  id: string
  name: string
  archived: boolean
  sort_order: number
  created_at: string
}

interface EntryRow {
  id: string
  habit_id: string
  date: string
  done: boolean
}

interface DebtRow {
  id: string
  name: string
  opening_balance: number | string
  annual_rate: number | string | null
  monthly_payment: number | string
  status: string
  archived: boolean
  sort_order: number
  created_at: string
}

interface PaymentRow {
  id: string
  debt_id: string
  date: string
  amount: number | string
}

export function rowToHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    archived: r.archived,
    order: r.sort_order,
  }
}

export function habitToRow(h: Habit) {
  return {
    id: h.id,
    name: h.name,
    archived: h.archived,
    sort_order: h.order,
    created_at: h.createdAt,
  }
}

export function rowToEntry(r: EntryRow): HabitEntry {
  return { id: r.id, habitId: r.habit_id, date: r.date, done: r.done }
}

export function entryToRow(e: HabitEntry) {
  return { id: e.id, habit_id: e.habitId, date: e.date, done: e.done }
}

export function rowToDebt(r: DebtRow): Debt {
  return {
    id: r.id,
    name: r.name,
    openingBalance: Number(r.opening_balance),
    annualRate: r.annual_rate == null ? null : Number(r.annual_rate),
    monthlyPayment: Number(r.monthly_payment),
    status: r.status as DebtStatus,
    createdAt: r.created_at,
    archived: r.archived,
    order: r.sort_order,
  }
}

export function debtToRow(d: Debt) {
  return {
    id: d.id,
    name: d.name,
    opening_balance: d.openingBalance,
    annual_rate: d.annualRate,
    monthly_payment: d.monthlyPayment,
    status: d.status,
    archived: d.archived,
    sort_order: d.order,
    created_at: d.createdAt,
  }
}

export function rowToPayment(r: PaymentRow): Payment {
  return { id: r.id, debtId: r.debt_id, date: r.date, amount: Number(r.amount) }
}

export function paymentToRow(p: Payment) {
  return { id: p.id, debt_id: p.debtId, date: p.date, amount: p.amount }
}

interface IdeaRow {
  id: string
  text: string
  status: string
  created_at: string
  archived: boolean
  closed_at: string | null
}

export function rowToIdea(r: IdeaRow): Idea {
  return {
    id: r.id,
    text: r.text,
    status: r.status as IdeaStatus,
    createdAt: r.created_at,
    archived: r.archived,
    closedAt: r.closed_at,
  }
}

export function ideaToRow(i: Idea) {
  return {
    id: i.id,
    text: i.text,
    status: i.status,
    created_at: i.createdAt,
    archived: i.archived,
    closed_at: i.closedAt,
  }
}

interface TaskRow {
  id: string
  text: string
  date: string | null
  planned_for: string | null
  done: boolean
  archived: boolean
  created_at: string
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    text: r.text,
    date: r.date,
    plannedFor: r.planned_for,
    done: r.done,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function taskToRow(t: Task) {
  return {
    id: t.id,
    text: t.text,
    date: t.date,
    planned_for: t.plannedFor,
    done: t.done,
    archived: t.archived,
    created_at: t.createdAt,
  }
}

interface JournalRow {
  id: string
  date: string
  text: string | null
  ciphertext: string | null
  iv: string | null
  encrypted: boolean
  created_at: string
  archived: boolean
}

export function rowToJournalNote(r: JournalRow): JournalNote {
  return {
    id: r.id,
    date: r.date,
    text: r.text,
    ciphertext: r.ciphertext,
    iv: r.iv,
    encrypted: r.encrypted,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function journalNoteToRow(n: JournalNote) {
  return {
    id: n.id,
    date: n.date,
    text: n.text,
    ciphertext: n.ciphertext,
    iv: n.iv,
    encrypted: n.encrypted,
    created_at: n.createdAt,
    archived: n.archived,
  }
}

interface GoalRow {
  id: string
  week_start: string
  text: string
  resultado: string | null
  archived: boolean
  created_at: string
}

export function rowToGoal(r: GoalRow): WeeklyGoal {
  return {
    id: r.id,
    weekStart: r.week_start,
    text: r.text,
    resultado: r.resultado as GoalResult | null,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function goalToRow(g: WeeklyGoal) {
  return {
    id: g.id,
    week_start: g.weekStart,
    text: g.text,
    resultado: g.resultado,
    archived: g.archived,
    created_at: g.createdAt,
  }
}

interface GoalUpdateRow {
  id: string
  goal_id: string
  date: string
  text: string
  direction: string
  created_at: string
}

export function rowToGoalUpdate(r: GoalUpdateRow): GoalUpdate {
  return {
    id: r.id,
    goalId: r.goal_id,
    date: r.date,
    text: r.text,
    direction: r.direction as GoalDirection,
    createdAt: r.created_at,
  }
}

export function goalUpdateToRow(u: GoalUpdate) {
  return {
    id: u.id,
    goal_id: u.goalId,
    date: u.date,
    text: u.text,
    direction: u.direction,
    created_at: u.createdAt,
  }
}

interface DayCommentRow {
  id: string
  date: string
  text: string
  created_at: string
}

export function rowToDayComment(r: DayCommentRow): DayComment {
  return { id: r.id, date: r.date, text: r.text, createdAt: r.created_at }
}

export function dayCommentToRow(c: DayComment) {
  return { id: c.id, date: c.date, text: c.text, created_at: c.createdAt }
}

interface SalaryPeriodRow {
  id: string
  period_start: string
  period_end: string
  amount: number | string
  archived: boolean
  created_at: string
}

export function rowToSalaryPeriod(r: SalaryPeriodRow): SalaryPeriod {
  return {
    id: r.id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    amount: Number(r.amount),
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function salaryPeriodToRow(p: SalaryPeriod) {
  return {
    id: p.id,
    period_start: p.periodStart,
    period_end: p.periodEnd,
    amount: p.amount,
    archived: p.archived,
    created_at: p.createdAt,
  }
}

interface FixedExpenseRow {
  id: string
  name: string
  amount: number | string
  quincena: string
  archived: boolean
  created_at: string
}

export function rowToFixedExpense(r: FixedExpenseRow): FixedExpense {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    quincena: r.quincena as Quincena,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function fixedExpenseToRow(e: FixedExpense) {
  return {
    id: e.id,
    name: e.name,
    amount: e.amount,
    quincena: e.quincena,
    archived: e.archived,
    created_at: e.createdAt,
  }
}

interface SavingsGoalRow {
  id: string
  name: string
  target_amount: number | string
  target_date: string | null
  archived: boolean
  created_at: string
}

export function rowToSavingsGoal(r: SavingsGoalRow): SavingsGoal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: Number(r.target_amount),
    targetDate: r.target_date,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function savingsGoalToRow(g: SavingsGoal) {
  return {
    id: g.id,
    name: g.name,
    target_amount: g.targetAmount,
    target_date: g.targetDate,
    archived: g.archived,
    created_at: g.createdAt,
  }
}

interface SavingsContributionRow {
  id: string
  goal_id: string
  date: string
  amount: number | string
  archived: boolean
  created_at: string
}

export function rowToSavingsContribution(r: SavingsContributionRow): SavingsContribution {
  return {
    id: r.id,
    goalId: r.goal_id,
    date: r.date,
    amount: Number(r.amount),
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function savingsContributionToRow(c: SavingsContribution) {
  return {
    id: c.id,
    goal_id: c.goalId,
    date: c.date,
    amount: c.amount,
    archived: c.archived,
    created_at: c.createdAt,
  }
}

interface IncomeRow {
  id: string
  date: string
  amount: number | string
  category: string | null
  note: string | null
  archived: boolean
  created_at: string
}

export function rowToIncome(r: IncomeRow): Income {
  return {
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    category: r.category,
    note: r.note,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function incomeToRow(i: Income) {
  return {
    id: i.id,
    date: i.date,
    amount: i.amount,
    category: i.category,
    note: i.note,
    archived: i.archived,
    created_at: i.createdAt,
  }
}

interface ExpenseRow {
  id: string
  date: string
  amount: number | string
  concept: string
  category: string | null
  note: string | null
  fixed_expense_id: string | null
  archived: boolean
  created_at: string
}

export function rowToExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    concept: r.concept,
    category: r.category,
    note: r.note,
    fixedExpenseId: r.fixed_expense_id,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function expenseToRow(e: Expense) {
  return {
    id: e.id,
    date: e.date,
    amount: e.amount,
    concept: e.concept,
    category: e.category,
    note: e.note,
    fixed_expense_id: e.fixedExpenseId,
    archived: e.archived,
    created_at: e.createdAt,
  }
}

interface JournalKeyRow {
  id: string
  wrapped_dek_password: string
  salt_password: string
  iv_password: string
  wrapped_dek_recovery: string
  salt_recovery: string
  iv_recovery: string
  created_at: string
  updated_at: string
}

export function rowToJournalKey(r: JournalKeyRow): JournalKey {
  return {
    id: r.id,
    wrappedDekPassword: r.wrapped_dek_password,
    saltPassword: r.salt_password,
    ivPassword: r.iv_password,
    wrappedDekRecovery: r.wrapped_dek_recovery,
    saltRecovery: r.salt_recovery,
    ivRecovery: r.iv_recovery,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function journalKeyWrappingToRow(w: JournalKeyWrapping) {
  return {
    wrapped_dek_password: w.wrappedDekPassword,
    salt_password: w.saltPassword,
    iv_password: w.ivPassword,
    wrapped_dek_recovery: w.wrappedDekRecovery,
    salt_recovery: w.saltRecovery,
    iv_recovery: w.ivRecovery,
  }
}

interface MentorAnalysisRow {
  id: string
  tipo: string
  period_start: string
  period_end: string
  tono: string
  incluyo_dinero: boolean
  contenido: string
  archived: boolean
  created_at: string
}

export function rowToMentorAnalysis(r: MentorAnalysisRow): MentorAnalysis {
  return {
    id: r.id,
    tipo: r.tipo as MentorAnalysisType,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    tono: r.tono as Tone,
    incluyoDinero: r.incluyo_dinero,
    contenido: r.contenido,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function mentorAnalysisToRow(a: MentorAnalysis) {
  return {
    id: a.id,
    tipo: a.tipo,
    period_start: a.periodStart,
    period_end: a.periodEnd,
    tono: a.tono,
    incluyo_dinero: a.incluyoDinero,
    contenido: a.contenido,
    archived: a.archived,
    created_at: a.createdAt,
  }
}

interface MentorSummaryRow {
  id: string
  contenido: string
  previous_contenido: string | null
  created_at: string
  updated_at: string
}

export function rowToMentorSummary(r: MentorSummaryRow): MentorSummary {
  return {
    id: r.id,
    contenido: r.contenido,
    previousContenido: r.previous_contenido,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// No hay un "mentorSummaryToRow" simétrico: a diferencia de las demás
// entidades, escribir el resumen no es convertir un objeto ya armado -- el
// valor de `previous_contenido` depende de leer la fila anterior primero
// (ver `saveMentorSummary` en `./mentor`), así que esa lógica vive ahí, no
// en un conversor genérico aquí.
