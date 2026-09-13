/**
 * El módulo de datos de la meta de ahorro, contra Supabase.
 *
 * Una sola meta activa a la vez: lo hace cumplir `createSavingsGoal` y, como
 * respaldo, un índice único parcial en la base de datos. Los aportes son otra
 * tabla (`savingsContributions.ts`); editar la meta nunca los toca.
 */

import { isISODate } from './dates'
import { rowToSavingsGoal, SAVINGS_GOAL_COLS, savingsGoalToRow } from './rows'
import { supabase, unwrap } from './supabase'
import type { SavingsGoal } from './types'

/** Los campos que la interfaz puede fijar al crear o editar la meta. */
export interface SavingsGoalInput {
  name: string
  targetAmount: number
  targetDate: string | null
}

function assertValidInput(input: SavingsGoalInput): void {
  if (!input.name.trim()) {
    throw new Error('El nombre de la meta no puede estar vacío')
  }
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    throw new Error('La meta debe ser mayor que cero')
  }
  if (input.targetDate !== null && !isISODate(input.targetDate)) {
    throw new Error(`Fecha inválida: ${input.targetDate} (se espera YYYY-MM-DD)`)
  }
}

/** La meta de ahorro activa, o `undefined` si no hay ninguna. */
export async function getActiveSavingsGoal(): Promise<SavingsGoal | undefined> {
  const rows = unwrap(
    await supabase.from('savings_goal').select(SAVINGS_GOAL_COLS).eq('archived', false).limit(1),
    'getActiveSavingsGoal',
  )
  return rows[0] ? rowToSavingsGoal(rows[0]) : undefined
}

/** Crea la meta de ahorro activa. Lanza si ya hay una (archívala primero). */
export async function createSavingsGoal(input: SavingsGoalInput): Promise<SavingsGoal> {
  assertValidInput(input)
  const existing = await getActiveSavingsGoal()
  if (existing) {
    throw new Error('Ya hay una meta de ahorro activa; archívala antes de crear otra')
  }

  const goal: SavingsGoal = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    targetAmount: Math.round(input.targetAmount),
    targetDate: input.targetDate,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('savings_goal').insert(savingsGoalToRow(goal)).select(SAVINGS_GOAL_COLS),
    'createSavingsGoal',
  )
  return rowToSavingsGoal(rows[0])
}

/** Edita nombre, monto o fecha objetivo de la meta. No toca los aportes ya anotados. */
export async function updateSavingsGoal(id: string, input: SavingsGoalInput): Promise<SavingsGoal> {
  assertValidInput(input)

  const rows = unwrap(
    await supabase
      .from('savings_goal')
      .update({
        name: input.name.trim(),
        target_amount: Math.round(input.targetAmount),
        target_date: input.targetDate,
      })
      .eq('id', id)
      .select(SAVINGS_GOAL_COLS),
    'updateSavingsGoal',
  )
  if (!rows[0]) throw new Error(`No existe la meta de ahorro ${id}`)
  return rowToSavingsGoal(rows[0])
}

/** Archiva la meta activa (libera el cupo para crear otra). Idempotente. */
export async function archiveSavingsGoal(id: string): Promise<void> {
  const res = await supabase.from('savings_goal').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveSavingsGoal: ${res.error.message}`)
}
