/**
 * El módulo de datos de gastos fijos, contra Supabase.
 *
 * Un gasto fijo no guarda cadencia: se deriva de `quincena` (`fixedExpenseCadence`
 * más abajo) — `'ambas'` es quincenal, `'primera'`/`'segunda'` es mensual. Guardar
 * las dos cosas por separado permitiría que se desincronizaran, así que la
 * interfaz solo pide una y calcula la otra al mostrarla.
 */

import { FIXED_EXPENSE_COLS, fixedExpenseToRow, rowToFixedExpense } from './rows'
import { supabase, unwrap } from './supabase'
import type { FixedExpense, FixedExpenseCadence, Quincena } from './types'

/** Los campos que la interfaz puede fijar al crear o editar un gasto fijo. */
export interface FixedExpenseInput {
  name: string
  amount: number
  quincena: Quincena
}

function assertValidInput(input: FixedExpenseInput): void {
  if (!input.name.trim()) {
    throw new Error('El nombre del gasto no puede estar vacío')
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto debe ser mayor que cero')
  }
}

/** Los gastos fijos activos, en el orden en que se crearon. */
export async function listFixedExpenses(): Promise<FixedExpense[]> {
  const rows = unwrap(
    await supabase
      .from('fixed_expenses')
      .select(FIXED_EXPENSE_COLS)
      .eq('archived', false)
      .order('created_at', { ascending: true }),
    'listFixedExpenses',
  )
  return rows.map(rowToFixedExpense)
}

/** Crea un gasto fijo activo (la "alta rápida" de la interfaz). */
export async function createFixedExpense(input: FixedExpenseInput): Promise<FixedExpense> {
  assertValidInput(input)

  const expense: FixedExpense = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    amount: Math.round(input.amount),
    quincena: input.quincena,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('fixed_expenses').insert(fixedExpenseToRow(expense)).select(FIXED_EXPENSE_COLS),
    'createFixedExpense',
  )
  return rowToFixedExpense(rows[0])
}

/** Edita nombre, monto o quincena de un gasto fijo (edición en línea). */
export async function updateFixedExpense(
  id: string,
  input: FixedExpenseInput,
): Promise<FixedExpense> {
  assertValidInput(input)

  const rows = unwrap(
    await supabase
      .from('fixed_expenses')
      .update({
        name: input.name.trim(),
        amount: Math.round(input.amount),
        quincena: input.quincena,
      })
      .eq('id', id)
      .select(FIXED_EXPENSE_COLS),
    'updateFixedExpense',
  )
  if (!rows[0]) throw new Error(`No existe el gasto fijo ${id}`)
  return rowToFixedExpense(rows[0])
}

/** Archiva un gasto fijo (la interfaz pide confirmación de dos toques). Idempotente. */
export async function archiveFixedExpense(id: string): Promise<void> {
  const res = await supabase.from('fixed_expenses').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveFixedExpense: ${res.error.message}`)
}

// --- Derivados (puros) --------------------------------------------

/** Cómo se etiqueta la cadencia en la interfaz. Derivado de `quincena`; no se guarda. */
export function fixedExpenseCadence(expense: FixedExpense): FixedExpenseCadence {
  return expense.quincena === 'ambas' ? 'quincenal' : 'mensual'
}

/** ¿Este gasto fijo se cobra en la quincena `label` ('primera' o 'segunda')? */
export function appliesToQuincena(expense: FixedExpense, label: 'primera' | 'segunda'): boolean {
  return expense.quincena === 'ambas' || expense.quincena === label
}

/** Los gastos fijos de la lista que aplican a la quincena `label`. */
export function fixedExpensesForQuincena(
  expenses: FixedExpense[],
  label: 'primera' | 'segunda',
): FixedExpense[] {
  return expenses.filter((e) => appliesToQuincena(e, label))
}

/** Suma de una lista de gastos fijos. */
export function sumFixedExpenses(expenses: FixedExpense[]): number {
  return expenses.reduce((total, e) => total + e.amount, 0)
}
