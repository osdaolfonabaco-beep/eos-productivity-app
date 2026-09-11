/**
 * Traducción entre las filas de Supabase (snake_case) y las entidades de la app
 * (camelCase). El resto del código sigue viendo `Habit`, `HabitEntry`, `Debt` y
 * `Payment` sin enterarse de la base de datos.
 *
 * `user_id` y `updated_at` los maneja el servidor (default `auth.uid()` y
 * trigger); nunca se envían ni se leen aquí.
 */

import type {
  Debt,
  DebtStatus,
  Habit,
  HabitEntry,
  Idea,
  IdeaStatus,
  JournalEntry,
  Payment,
  Task,
} from './types'

export const HABIT_COLS = 'id,name,archived,sort_order,created_at'
export const ENTRY_COLS = 'id,habit_id,date,done'
export const DEBT_COLS =
  'id,name,opening_balance,annual_rate,monthly_payment,status,archived,sort_order,created_at'
export const PAYMENT_COLS = 'id,debt_id,date,amount'
export const IDEA_COLS = 'id,text,status,created_at,archived'
export const TASK_COLS = 'id,text,date,done,archived,created_at'
export const JOURNAL_COLS = 'id,date,text,created_at,archived'

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
}

export function rowToIdea(r: IdeaRow): Idea {
  return {
    id: r.id,
    text: r.text,
    status: r.status as IdeaStatus,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function ideaToRow(i: Idea) {
  return {
    id: i.id,
    text: i.text,
    status: i.status,
    created_at: i.createdAt,
    archived: i.archived,
  }
}

interface TaskRow {
  id: string
  text: string
  date: string | null
  done: boolean
  archived: boolean
  created_at: string
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    text: r.text,
    date: r.date,
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
    done: t.done,
    archived: t.archived,
    created_at: t.createdAt,
  }
}

interface JournalRow {
  id: string
  date: string
  text: string
  created_at: string
  archived: boolean
}

export function rowToJournalEntry(r: JournalRow): JournalEntry {
  return {
    id: r.id,
    date: r.date,
    text: r.text,
    createdAt: r.created_at,
    archived: r.archived,
  }
}

export function journalEntryToRow(e: JournalEntry) {
  return {
    id: e.id,
    date: e.date,
    text: e.text,
    created_at: e.createdAt,
    archived: e.archived,
  }
}
