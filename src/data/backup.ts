/**
 * Respaldo: exportar e importar todos los datos como un solo objeto JSON.
 *
 * "Exportar" y "reemplazar" trabajan contra Supabase (`async`). "Copia local"
 * lee lo que quedó en `localStorage` de antes de la migración (síncrono).
 */

import {
  DEBT_COLS,
  ENTRY_COLS,
  HABIT_COLS,
  PAYMENT_COLS,
  debtToRow,
  entryToRow,
  habitToRow,
  paymentToRow,
  rowToDebt,
  rowToEntry,
  rowToHabit,
  rowToPayment,
} from './rows'
import { KEYS, readList } from './storage'
import { assertOk, supabase, unwrap } from './supabase'
import type { Debt, Habit, HabitEntry, Payment } from './types'

const APP = 'productividad'
const VERSION = 1

/** Las cuatro colecciones. */
export interface BackupData {
  habits: Habit[]
  entries: HabitEntry[]
  debts: Debt[]
  payments: Payment[]
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
  const [habits, entries, debts, payments] = await Promise.all([
    supabase.from('habits').select(HABIT_COLS),
    supabase.from('habit_entries').select(ENTRY_COLS),
    supabase.from('debts').select(DEBT_COLS),
    supabase.from('payments').select(PAYMENT_COLS),
  ])
  return wrap({
    habits: unwrap(habits, 'exportAll hábitos').map(rowToHabit),
    entries: unwrap(entries, 'exportAll registros').map(rowToEntry),
    debts: unwrap(debts, 'exportAll deudas').map(rowToDebt),
    payments: unwrap(payments, 'exportAll pagos').map(rowToPayment),
  })
}

/** Los datos que quedaron en `localStorage` de este dispositivo. */
export function readLocalBackup(): BackupData {
  return {
    habits: readList<Habit>(KEYS.habits),
    entries: readList<HabitEntry>(KEYS.entries),
    debts: readList<Debt>(KEYS.debts),
    payments: readList<Payment>(KEYS.payments),
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

  return {
    habits: data.habits as Habit[],
    entries: data.entries as HabitEntry[],
    debts: data.debts as Debt[],
    payments: data.payments as Payment[],
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
  assertOk(await clear('debts'), 'reemplazar: borrar deudas')
  assertOk(await clear('habits'), 'reemplazar: borrar hábitos')

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
}

/** Valida y reemplaza en un paso. */
export async function importAll(value: unknown): Promise<void> {
  await applyBackup(parseBackup(value))
}
