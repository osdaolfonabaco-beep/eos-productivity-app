/**
 * El módulo de datos de aportes a la meta de ahorro, contra Supabase.
 *
 * Bitácora de solo-añadir, como `Payment` o `GoalUpdate`, pero aquí un aporte
 * mal registrado se archiva en vez de borrarse: lo pide el modelo de esta
 * tabla (`archived`), a diferencia de los pagos a deudas.
 */

import { isISODate } from './dates'
import {
  rowToSavingsContribution,
  SAVINGS_CONTRIBUTION_COLS,
  savingsContributionToRow,
} from './rows'
import { supabase, unwrap } from './supabase'
import type { SavingsContribution, SavingsGoal } from './types'

/** Los aportes activos de una meta, del más reciente al más antiguo. */
export async function listContributions(goalId: string): Promise<SavingsContribution[]> {
  const rows = unwrap(
    await supabase
      .from('savings_contributions')
      .select(SAVINGS_CONTRIBUTION_COLS)
      .eq('goal_id', goalId)
      .eq('archived', false)
      .order('date', { ascending: false }),
    'listContributions',
  )
  return rows.map(rowToSavingsContribution)
}

/** Anota un aporte a una meta. `date` en `YYYY-MM-DD`; `amount` en pesos, entero > 0. */
export async function addContribution(
  goalId: string,
  date: string,
  amount: number,
): Promise<SavingsContribution> {
  if (!isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El aporte debe ser mayor que cero')
  }

  const contribution: SavingsContribution = {
    id: crypto.randomUUID(),
    goalId,
    date,
    amount: Math.round(amount),
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase
      .from('savings_contributions')
      .insert(savingsContributionToRow(contribution))
      .select(SAVINGS_CONTRIBUTION_COLS),
    'addContribution',
  )
  return rowToSavingsContribution(rows[0])
}

/** Archiva un aporte (para corregir uno mal registrado). Idempotente. */
export async function archiveContribution(id: string): Promise<void> {
  const res = await supabase.from('savings_contributions').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveContribution: ${res.error.message}`)
}

// --- Derivados (puros) --------------------------------------------

/** Suma de una lista de aportes. */
export function sumContributions(contributions: SavingsContribution[]): number {
  return contributions.reduce((total, c) => total + c.amount, 0)
}

/** Progreso de la meta: aportado sobre la meta (puede pasar de 1 si se aportó de más). */
export function savingsProgress(goal: SavingsGoal, contributions: SavingsContribution[]): number {
  if (goal.targetAmount <= 0) return 0
  return sumContributions(contributions) / goal.targetAmount
}
