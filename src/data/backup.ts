/**
 * Respaldo: exportar e importar todos los datos como un solo objeto JSON.
 *
 * Reúne las cuatro colecciones (hábitos, registros, deudas, pagos) usando el
 * inventario de claves de `storage.ts`, para que añadir una colección nueva al
 * respaldo sea solo añadirla allí.
 */

import { KEYS, readList, writeList } from './storage'
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

/** Reúne el estado actual en un objeto de respaldo. */
export function exportAll(): BackupFile {
  return {
    app: APP,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      habits: readList<Habit>(KEYS.habits),
      entries: readList<HabitEntry>(KEYS.entries),
      debts: readList<Debt>(KEYS.debts),
      payments: readList<Payment>(KEYS.payments),
    },
  }
}

/**
 * Valida que `value` sea un respaldo de Productividad con las cuatro listas.
 * Devuelve los datos si es válido; lanza un `Error` con un mensaje claro si no.
 *
 * No comprueba cada campo de cada elemento: son datos propios, de un solo
 * usuario, y una validación exhaustiva daría más falsos rechazos que seguridad.
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
 * Reemplaza las cuatro colecciones por las del respaldo. No valida: pásale algo
 * que venga de `parseBackup`.
 */
export function applyBackup(data: BackupData): void {
  writeList(KEYS.habits, data.habits)
  writeList(KEYS.entries, data.entries)
  writeList(KEYS.debts, data.debts)
  writeList(KEYS.payments, data.payments)
}

/** Valida y aplica en un paso. */
export function importAll(value: unknown): void {
  applyBackup(parseBackup(value))
}
