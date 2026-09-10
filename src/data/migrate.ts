/**
 * Subida única de la copia local a la nube, manual y por dispositivo.
 *
 * Es ADITIVA: solo inserta filas cuyo `id` no está ya en la nube. Nunca borra
 * ni sobrescribe. Re-ejecutarla es seguro (la segunda vez todo sale como
 * "ya estaba"). Sirve para el caso de tener hábitos en un dispositivo y deudas
 * en otro y subir desde los dos.
 */

import { readLocalBackup } from './backup'
import { debtToRow, entryToRow, habitToRow, paymentToRow } from './rows'
import { assertOk, supabase, unwrap } from './supabase'

export interface TableReport {
  /** Cuántas filas de este tipo hay en la copia local. */
  localTotal: number
  /** Cuántas se subieron (no estaban en la nube). */
  uploaded: number
  /** Cuántas ya estaban en la nube (mismo id, o mismo hábito+fecha). */
  alreadyThere: number
  /** Cuántas se omitieron por no encontrar su hábito/deuda. */
  skipped: number
}

export interface UploadReport {
  habits: TableReport
  entries: TableReport
  debts: TableReport
  payments: TableReport
}

/** Cuántas filas de cada tipo hay en la copia local, para mostrar antes de subir. */
export function readLocalCounts() {
  const d = readLocalBackup()
  return {
    habits: d.habits.length,
    entries: d.entries.length,
    debts: d.debts.length,
    payments: d.payments.length,
  }
}

export async function uploadLocalData(): Promise<UploadReport> {
  const local = readLocalBackup()

  // --- hábitos: filtrar por id ya existente ---
  const cloudHabitIds = new Set(
    unwrap(await supabase.from('habits').select('id'), 'subir: leer hábitos').map((r) => r.id),
  )
  const newHabits = local.habits.filter((h) => !cloudHabitIds.has(h.id))
  if (newHabits.length) {
    assertOk(await supabase.from('habits').insert(newHabits.map(habitToRow)), 'subir hábitos')
    for (const h of newHabits) cloudHabitIds.add(h.id)
  }
  const habits: TableReport = {
    localTotal: local.habits.length,
    uploaded: newHabits.length,
    alreadyThere: local.habits.length - newHabits.length,
    skipped: 0,
  }

  // --- registros: filtrar por id, por (habit_id, date), y por hábito huérfano ---
  const existing = unwrap(
    await supabase.from('habit_entries').select('id,habit_id,date'),
    'subir: leer registros',
  )
  const existingEntryIds = new Set(existing.map((r) => r.id))
  const existingPairs = new Set(existing.map((r) => `${r.habit_id}|${r.date}`))
  let entriesSkipped = 0
  const newEntries = local.entries.filter((e) => {
    if (existingEntryIds.has(e.id)) return false
    if (existingPairs.has(`${e.habitId}|${e.date}`)) return false
    if (!cloudHabitIds.has(e.habitId)) {
      entriesSkipped++
      return false
    }
    return true
  })
  if (newEntries.length) {
    assertOk(
      await supabase.from('habit_entries').insert(newEntries.map(entryToRow)),
      'subir registros',
    )
  }
  const entries: TableReport = {
    localTotal: local.entries.length,
    uploaded: newEntries.length,
    alreadyThere: local.entries.length - newEntries.length - entriesSkipped,
    skipped: entriesSkipped,
  }

  // --- deudas: filtrar por id ya existente ---
  const cloudDebtIds = new Set(
    unwrap(await supabase.from('debts').select('id'), 'subir: leer deudas').map((r) => r.id),
  )
  const newDebts = local.debts.filter((d) => !cloudDebtIds.has(d.id))
  if (newDebts.length) {
    assertOk(await supabase.from('debts').insert(newDebts.map(debtToRow)), 'subir deudas')
    for (const d of newDebts) cloudDebtIds.add(d.id)
  }
  const debts: TableReport = {
    localTotal: local.debts.length,
    uploaded: newDebts.length,
    alreadyThere: local.debts.length - newDebts.length,
    skipped: 0,
  }

  // --- pagos: filtrar por id y por deuda huérfana ---
  const existingPaymentIds = new Set(
    unwrap(await supabase.from('payments').select('id'), 'subir: leer pagos').map((r) => r.id),
  )
  let paymentsSkipped = 0
  const newPayments = local.payments.filter((p) => {
    if (existingPaymentIds.has(p.id)) return false
    if (!cloudDebtIds.has(p.debtId)) {
      paymentsSkipped++
      return false
    }
    return true
  })
  if (newPayments.length) {
    assertOk(
      await supabase.from('payments').insert(newPayments.map(paymentToRow)),
      'subir pagos',
    )
  }
  const payments: TableReport = {
    localTotal: local.payments.length,
    uploaded: newPayments.length,
    alreadyThere: local.payments.length - newPayments.length - paymentsSkipped,
    skipped: paymentsSkipped,
  }

  return { habits, entries, debts, payments }
}
