/**
 * El módulo de datos de gastos reales, contra Supabase.
 *
 * A diferencia de `fixedExpenses.ts` (la plantilla de lo esperado), esto es
 * lo que de verdad se gastó: con fecha, monto y concepto obligatorio. Un
 * gasto puede venir de una plantilla (`fixedExpenseId`) o ser suelto. Ver el
 * comentario largo en `getPeriodBreakdown` (`salaryPeriods.ts`) para el
 * modelo completo de cómo esto y las plantillas entran en el disponible.
 */

import { isISODate } from './dates'
import { EXPENSE_COLS, expenseToRow, rowToExpense } from './rows'
import { supabase, unwrap } from './supabase'
import type { Expense } from './types'

/** Mismo tope que el check de la base: no limita nada real, es la red contra un dedazo. */
const MAX_AMOUNT = 100_000_000_000

/** Los campos que la interfaz puede fijar al crear o editar un gasto. */
export interface ExpenseInput {
  date: string
  amount: number
  concept: string
  category: string | null
  note: string | null
  fixedExpenseId: string | null
}

function assertValidInput(input: Pick<ExpenseInput, 'date' | 'amount' | 'concept'>): void {
  if (!isISODate(input.date)) {
    throw new Error(`Fecha inválida: ${input.date} (se espera YYYY-MM-DD)`)
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto debe ser mayor que cero')
  }
  if (input.amount > MAX_AMOUNT) {
    throw new Error('El monto es demasiado grande')
  }
  if (!input.concept.trim()) {
    throw new Error('El concepto no puede estar vacío')
  }
}

/**
 * Recorta un campo de texto opcional y lo deja en `null` si queda vacío — el
 * check de la base (`char_length(trim(x)) > 0`) rechaza la cadena vacía, así
 * que "sin categoría" o "sin nota" tienen que llegar como `null`, no como `''`.
 */
function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Los gastos activos con fecha entre `start` y `end`, ambos incluidos, del más reciente al más antiguo. */
export async function listExpenses(start: string, end: string): Promise<Expense[]> {
  const rows = unwrap(
    await supabase
      .from('expenses')
      .select(EXPENSE_COLS)
      .gte('date', start)
      .lte('date', end)
      .eq('archived', false)
      .order('date', { ascending: false }),
    'listExpenses',
  )
  return rows.map(rowToExpense)
}

/** Anota un gasto. */
export async function createExpense(input: ExpenseInput): Promise<Expense> {
  assertValidInput(input)

  const expense: Expense = {
    id: crypto.randomUUID(),
    date: input.date,
    amount: Math.round(input.amount),
    concept: input.concept.trim(),
    category: normalizeOptionalText(input.category),
    note: normalizeOptionalText(input.note),
    fixedExpenseId: input.fixedExpenseId,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('expenses').insert(expenseToRow(expense)).select(EXPENSE_COLS),
    'createExpense',
  )
  return rowToExpense(rows[0])
}

/** Edita fecha, monto, concepto, categoría o nota de un gasto (edición en línea). */
export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  assertValidInput(input)

  const rows = unwrap(
    await supabase
      .from('expenses')
      .update({
        date: input.date,
        amount: Math.round(input.amount),
        concept: input.concept.trim(),
        category: normalizeOptionalText(input.category),
        note: normalizeOptionalText(input.note),
        fixed_expense_id: input.fixedExpenseId,
      })
      .eq('id', id)
      .select(EXPENSE_COLS),
    'updateExpense',
  )
  if (!rows[0]) throw new Error(`No existe el gasto ${id}`)
  return rowToExpense(rows[0])
}

/** Archiva un gasto (la interfaz pide confirmación de dos toques). Idempotente. */
export async function archiveExpense(id: string): Promise<void> {
  const res = await supabase.from('expenses').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveExpense: ${res.error.message}`)
}

// --- Derivados (puros) --------------------------------------------

/** Suma de una lista de gastos. */
export function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((total, e) => total + e.amount, 0)
}

/**
 * Qué plantillas de gastos fijos ya tienen un gasto real en el rango
 * `start`–`end`: el conjunto de `fixedExpenseId` que aparecen en gastos no
 * archivados de ese rango. No se guarda en ningún sitio — se deduce de
 * `expenses` en cada llamada, así que nunca puede desincronizarse.
 */
export async function fixedExpenseIdsWithExpenseInRange(
  start: string,
  end: string,
): Promise<Set<string>> {
  const rows = unwrap(
    await supabase
      .from('expenses')
      .select('fixed_expense_id')
      .gte('date', start)
      .lte('date', end)
      .eq('archived', false)
      .not('fixed_expense_id', 'is', null),
    'fixedExpenseIdsWithExpenseInRange',
  )
  return new Set(
    rows
      .map((r) => (r as { fixed_expense_id: string | null }).fixed_expense_id)
      .filter((id): id is string => id !== null),
  )
}
