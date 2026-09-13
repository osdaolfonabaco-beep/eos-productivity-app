/**
 * Respaldo: exportar e importar todos los datos como un solo objeto JSON.
 *
 * "Exportar" y "reemplazar" trabajan contra Supabase (`async`). "Copia local"
 * lee lo que quedó en `localStorage` de antes de la migración (síncrono).
 */

import {
  DEBT_COLS,
  ENTRY_COLS,
  GOAL_COLS,
  GOAL_UPDATE_COLS,
  HABIT_COLS,
  IDEA_COLS,
  JOURNAL_COLS,
  PAYMENT_COLS,
  TASK_COLS,
  debtToRow,
  entryToRow,
  goalToRow,
  goalUpdateToRow,
  habitToRow,
  ideaToRow,
  journalNoteToRow,
  paymentToRow,
  rowToDebt,
  rowToEntry,
  rowToGoal,
  rowToGoalUpdate,
  rowToHabit,
  rowToIdea,
  rowToJournalNote,
  rowToPayment,
  rowToTask,
  taskToRow,
} from './rows'
import { KEYS, readList } from './storage'
import { assertOk, supabase, unwrap } from './supabase'
import type {
  Debt,
  GoalUpdate,
  Habit,
  HabitEntry,
  Idea,
  JournalNote,
  Payment,
  Task,
  WeeklyGoal,
} from './types'

const APP = 'productividad'
const VERSION = 1

/** Las nueve colecciones. */
export interface BackupData {
  habits: Habit[]
  entries: HabitEntry[]
  debts: Debt[]
  payments: Payment[]
  ideas: Idea[]
  tasks: Task[]
  journal: JournalNote[]
  weeklyGoals: WeeklyGoal[]
  goalUpdates: GoalUpdate[]
}

/** El archivo de respaldo tal como se descarga. */
export interface BackupFile {
  app: typeof APP
  version: number
  exportedAt: string
  data: BackupData
}

function wrap(data: BackupData): BackupFile {
  return { app: APP, version: VERSION, exportedAt: new Date().toISOString(), data }
}

/** Reúne el estado de la nube en un objeto de respaldo. */
export async function exportAll(): Promise<BackupFile> {
  const [habits, entries, debts, payments, ideas, tasks, journal, weeklyGoals, goalUpdates] =
    await Promise.all([
      supabase.from('habits').select(HABIT_COLS),
      supabase.from('habit_entries').select(ENTRY_COLS),
      supabase.from('debts').select(DEBT_COLS),
      supabase.from('payments').select(PAYMENT_COLS),
      supabase.from('ideas').select(IDEA_COLS),
      supabase.from('tasks').select(TASK_COLS),
      supabase.from('journal_entries').select(JOURNAL_COLS),
      supabase.from('weekly_goals').select(GOAL_COLS),
      supabase.from('goal_updates').select(GOAL_UPDATE_COLS),
    ])
  return wrap({
    habits: unwrap(habits, 'exportAll hábitos').map(rowToHabit),
    entries: unwrap(entries, 'exportAll registros').map(rowToEntry),
    debts: unwrap(debts, 'exportAll deudas').map(rowToDebt),
    payments: unwrap(payments, 'exportAll pagos').map(rowToPayment),
    ideas: unwrap(ideas, 'exportAll ideas').map(rowToIdea),
    tasks: unwrap(tasks, 'exportAll tareas').map(rowToTask),
    journal: unwrap(journal, 'exportAll diario').map(rowToJournalNote),
    weeklyGoals: unwrap(weeklyGoals, 'exportAll metas').map(rowToGoal),
    goalUpdates: unwrap(goalUpdates, 'exportAll avances').map(rowToGoalUpdate),
  })
}

/** Los datos que quedaron en `localStorage` de este dispositivo. */
export function readLocalBackup(): BackupData {
  return {
    habits: readList<Habit>(KEYS.habits),
    entries: readList<HabitEntry>(KEYS.entries),
    debts: readList<Debt>(KEYS.debts),
    payments: readList<Payment>(KEYS.payments),
    // Ideas, Tareas, Journal y Metas nunca vivieron en localStorage: nacieron en la nube.
    ideas: [],
    tasks: [],
    journal: [],
    weeklyGoals: [],
    goalUpdates: [],
  }
}

/** La copia local envuelta como archivo de respaldo, para descargarla. */
export function exportLocal(): BackupFile {
  return wrap(readLocalBackup())
}

/**
 * Valida que `value` sea un respaldo de Productividad con las cuatro listas.
 * Devuelve los datos si es válido; lanza un `Error` claro si no. No comprueba
 * cada campo: son datos propios de un solo usuario.
 */
export function parseBackup(value: unknown): BackupData {
  if (typeof value !== 'object' || value === null) {
    throw new Error('El archivo no es un respaldo válido.')
  }
  const file = value as Record<string, unknown>
  if (file.app !== APP) {
    throw new Error('El archivo no parece un respaldo de Productividad.')
  }
  if (typeof file.version !== 'number') {
    throw new Error('El archivo no es un respaldo válido.')
  }
  if (typeof file.data !== 'object' || file.data === null) {
    throw new Error('El respaldo no contiene datos.')
  }

  const data = file.data as Record<string, unknown>
  const lists = ['habits', 'entries', 'debts', 'payments'] as const
  for (const key of lists) {
    if (!Array.isArray(data[key])) {
      throw new Error(`El respaldo no contiene la lista "${key}".`)
    }
  }
  // `ideas`, `tasks`, `journal`, `weeklyGoals` y `goalUpdates` son opcionales:
  // los respaldos anteriores a cada una no las traen.
  for (const key of ['ideas', 'tasks', 'journal', 'weeklyGoals', 'goalUpdates'] as const) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`La lista "${key}" del respaldo no es válida.`)
    }
  }

  return {
    habits: data.habits as Habit[],
    entries: data.entries as HabitEntry[],
    debts: data.debts as Debt[],
    payments: data.payments as Payment[],
    ideas: (data.ideas as Idea[] | undefined) ?? [],
    tasks: (data.tasks as Task[] | undefined) ?? [],
    journal: (data.journal as JournalNote[] | undefined) ?? [],
    weeklyGoals: (data.weeklyGoals as WeeklyGoal[] | undefined) ?? [],
    goalUpdates: (data.goalUpdates as GoalUpdate[] | undefined) ?? [],
  }
}

/**
 * Reemplaza en la nube las cuatro colecciones por las del respaldo. Borra en
 * orden de claves foráneas (hijas primero) e inserta en el orden inverso.
 * No es una transacción entre tablas: si falla a mitad, queda parcial y hay que
 * reintentar (por eso la interfaz exige bajar un respaldo antes).
 */
export async function applyBackup(data: BackupData): Promise<void> {
  const clear = (table: string) => supabase.from(table).delete().not('id', 'is', null)

  assertOk(await clear('payments'), 'reemplazar: borrar pagos')
  assertOk(await clear('habit_entries'), 'reemplazar: borrar registros')
  assertOk(await clear('goal_updates'), 'reemplazar: borrar avances')
  assertOk(await clear('debts'), 'reemplazar: borrar deudas')
  assertOk(await clear('habits'), 'reemplazar: borrar hábitos')
  assertOk(await clear('weekly_goals'), 'reemplazar: borrar metas')
  assertOk(await clear('ideas'), 'reemplazar: borrar ideas')
  assertOk(await clear('tasks'), 'reemplazar: borrar tareas')
  assertOk(await clear('journal_entries'), 'reemplazar: borrar diario')

  if (data.habits.length) {
    assertOk(
      await supabase.from('habits').insert(data.habits.map(habitToRow)),
      'reemplazar: hábitos',
    )
  }
  if (data.entries.length) {
    assertOk(
      await supabase.from('habit_entries').insert(data.entries.map(entryToRow)),
      'reemplazar: registros',
    )
  }
  if (data.debts.length) {
    assertOk(
      await supabase.from('debts').insert(data.debts.map(debtToRow)),
      'reemplazar: deudas',
    )
  }
  if (data.payments.length) {
    assertOk(
      await supabase.from('payments').insert(data.payments.map(paymentToRow)),
      'reemplazar: pagos',
    )
  }
  if (data.ideas.length) {
    assertOk(
      await supabase.from('ideas').insert(data.ideas.map(ideaToRow)),
      'reemplazar: ideas',
    )
  }
  if (data.tasks.length) {
    assertOk(
      await supabase.from('tasks').insert(data.tasks.map(taskToRow)),
      'reemplazar: tareas',
    )
  }
  if (data.journal.length) {
    assertOk(
      await supabase.from('journal_entries').insert(data.journal.map(journalNoteToRow)),
      'reemplazar: diario',
    )
  }
  if (data.weeklyGoals.length) {
    assertOk(
      await supabase.from('weekly_goals').insert(data.weeklyGoals.map(goalToRow)),
      'reemplazar: metas',
    )
  }
  if (data.goalUpdates.length) {
    assertOk(
      await supabase.from('goal_updates').insert(data.goalUpdates.map(goalUpdateToRow)),
      'reemplazar: avances',
    )
  }
}

/** Valida y reemplaza en un paso. */
export async function importAll(value: unknown): Promise<void> {
  await applyBackup(parseBackup(value))
}
