/**
 * El módulo de datos de ingresos sueltos, contra Supabase.
 *
 * El sueldo de la quincena NO vive aquí: sigue en `salary_periods`
 * (`salaryPeriods.ts`). Un ingreso es cualquier entrada de dinero aparte del
 * sueldo — la interfaz muestra el sueldo como una fila sintética calculada al
 * leer, nunca guardada en esta tabla (ver el comentario en
 * `getPeriodBreakdown`, que es donde importa no duplicarlo).
 */

import { isISODate } from './dates'
import { incomeToRow, INCOME_COLS, rowToIncome } from './rows'
import { supabase, unwrap } from './supabase'
import type { Income } from './types'

/** Mismo tope que el check de la base: no limita nada real, es la red contra un dedazo. */
const MAX_AMOUNT = 100_000_000_000

/** Los campos que la interfaz puede fijar al crear o editar un ingreso. */
export interface IncomeInput {
  date: string
  amount: number
  category: string | null
  note: string | null
}

function assertValidInput(input: Pick<IncomeInput, 'date' | 'amount'>): void {
  if (!isISODate(input.date)) {
    throw new Error(`Fecha inválida: ${input.date} (se espera YYYY-MM-DD)`)
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto debe ser mayor que cero')
  }
  if (input.amount > MAX_AMOUNT) {
    throw new Error('El monto es demasiado grande')
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

/** Los ingresos activos con fecha entre `start` y `end`, ambos incluidos, del más reciente al más antiguo. */
export async function listIncomes(start: string, end: string): Promise<Income[]> {
  const rows = unwrap(
    await supabase
      .from('incomes')
      .select(INCOME_COLS)
      .gte('date', start)
      .lte('date', end)
      .eq('archived', false)
      .order('date', { ascending: false }),
    'listIncomes',
  )
  return rows.map(rowToIncome)
}

/** Anota un ingreso. */
export async function createIncome(input: IncomeInput): Promise<Income> {
  assertValidInput(input)

  const income: Income = {
    id: crypto.randomUUID(),
    date: input.date,
    amount: Math.round(input.amount),
    category: normalizeOptionalText(input.category),
    note: normalizeOptionalText(input.note),
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('incomes').insert(incomeToRow(income)).select(INCOME_COLS),
    'createIncome',
  )
  return rowToIncome(rows[0])
}

/** Edita fecha, monto, categoría o nota de un ingreso (edición en línea). */
export async function updateIncome(id: string, input: IncomeInput): Promise<Income> {
  assertValidInput(input)

  const rows = unwrap(
    await supabase
      .from('incomes')
      .update({
        date: input.date,
        amount: Math.round(input.amount),
        category: normalizeOptionalText(input.category),
        note: normalizeOptionalText(input.note),
      })
      .eq('id', id)
      .select(INCOME_COLS),
    'updateIncome',
  )
  if (!rows[0]) throw new Error(`No existe el ingreso ${id}`)
  return rowToIncome(rows[0])
}

/** Archiva un ingreso (la interfaz pide confirmación de dos toques). Idempotente. */
export async function archiveIncome(id: string): Promise<void> {
  const res = await supabase.from('incomes').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveIncome: ${res.error.message}`)
}

// --- Derivados (puros) --------------------------------------------

/** Suma de una lista de ingresos. */
export function sumIncomes(incomes: Income[]): number {
  return incomes.reduce((total, i) => total + i.amount, 0)
}
