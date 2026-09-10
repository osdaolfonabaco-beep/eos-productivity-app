/**
 * El módulo de datos de finanzas: deudas y pagos, contra Supabase.
 *
 * Lecturas y escrituras `async`. El saldo actual de una deuda sigue derivándose
 * con los helpers puros síncronos (`sumPayments`, `debtBalance`).
 */

import { isISODate } from './dates'
import {
  DEBT_COLS,
  PAYMENT_COLS,
  debtToRow,
  paymentToRow,
  rowToDebt,
  rowToPayment,
} from './rows'
import { supabase, unwrap } from './supabase'
import type { Debt, DebtStatus, Payment } from './types'

/** Los campos que la interfaz puede fijar al crear o editar una deuda. */
export interface DebtInput {
  name: string
  openingBalance: number
  annualRate: number | null
  monthlyPayment: number
  status: DebtStatus
}

function assertValidInput(input: Pick<DebtInput, 'name' | 'openingBalance'>): void {
  if (!input.name.trim()) {
    throw new Error('El nombre de la deuda no puede estar vacío')
  }
  if (!Number.isFinite(input.openingBalance) || input.openingBalance < 0) {
    throw new Error('El saldo debe ser un número mayor o igual que cero')
  }
}

/** Normaliza los montos a enteros de pesos no negativos. */
function normalize(input: DebtInput) {
  return {
    name: input.name.trim(),
    openingBalance: Math.round(input.openingBalance),
    annualRate: input.annualRate,
    monthlyPayment: Math.max(0, Math.round(input.monthlyPayment || 0)),
    status: input.status,
  }
}

// --- Deudas ------------------------------------------------------------

/** Las deudas activas (no archivadas), ordenadas por `order`. */
export async function listDebts(): Promise<Debt[]> {
  const rows = unwrap(
    await supabase
      .from('debts')
      .select(DEBT_COLS)
      .eq('archived', false)
      .order('sort_order', { ascending: true }),
    'listDebts',
  )
  return rows.map(rowToDebt)
}

/** Una deuda por id, o `undefined`. Incluye las archivadas. */
export async function getDebt(id: string): Promise<Debt | undefined> {
  const rows = unwrap(
    await supabase.from('debts').select(DEBT_COLS).eq('id', id).limit(1),
    'getDebt',
  )
  return rows[0] ? rowToDebt(rows[0]) : undefined
}

/** Crea una deuda activa. El saldo pasado es el punto de partida. */
export async function createDebt(input: DebtInput): Promise<Debt> {
  assertValidInput(input)

  const top = unwrap(
    await supabase
      .from('debts')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1),
    'createDebt (orden)',
  )
  const maxOrder = top[0] ? top[0].sort_order : -1

  const debt: Debt = {
    id: crypto.randomUUID(),
    ...normalize(input),
    createdAt: new Date().toISOString(),
    archived: false,
    order: maxOrder + 1,
  }
  const rows = unwrap(
    await supabase.from('debts').insert(debtToRow(debt)).select(DEBT_COLS),
    'createDebt',
  )
  return rowToDebt(rows[0])
}

/** Edita una deuda. Cambiar el saldo es una corrección; no toca los pagos. */
export async function updateDebt(id: string, input: DebtInput): Promise<Debt> {
  assertValidInput(input)
  const n = normalize(input)

  const rows = unwrap(
    await supabase
      .from('debts')
      .update({
        name: n.name,
        opening_balance: n.openingBalance,
        annual_rate: n.annualRate,
        monthly_payment: n.monthlyPayment,
        status: n.status,
      })
      .eq('id', id)
      .select(DEBT_COLS),
    'updateDebt',
  )
  if (!rows[0]) throw new Error(`No existe la deuda ${id}`)
  return rowToDebt(rows[0])
}

/** Archiva una deuda (el botón "Archivar deuda"). Idempotente. */
export async function archiveDebt(id: string): Promise<void> {
  const res = await supabase.from('debts').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveDebt: ${res.error.message}`)
}

// --- Pagos -----------------------------------------------------------

/** Los pagos de una deuda, del más reciente al más antiguo. */
export async function getPayments(debtId: string): Promise<Payment[]> {
  const rows = unwrap(
    await supabase
      .from('payments')
      .select(PAYMENT_COLS)
      .eq('debt_id', debtId)
      .order('date', { ascending: false }),
    'getPayments',
  )
  return rows.map(rowToPayment)
}

/** Registra un pago. `date` en `YYYY-MM-DD`; `amount` en pesos, entero > 0. */
export async function addPayment(
  debtId: string,
  date: string,
  amount: number,
): Promise<Payment> {
  if (!isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El monto del pago debe ser mayor que cero')
  }

  const payment: Payment = {
    id: crypto.randomUUID(),
    debtId,
    date,
    amount: Math.round(amount),
  }
  const rows = unwrap(
    await supabase.from('payments').insert(paymentToRow(payment)).select(PAYMENT_COLS),
    'addPayment',
  )
  return rowToPayment(rows[0])
}

/** Borra un pago entero. La interfaz siempre lo pide con confirmación. */
export async function deletePayment(id: string): Promise<void> {
  const res = await supabase.from('payments').delete().eq('id', id)
  if (res.error) throw new Error(`deletePayment: ${res.error.message}`)
}

// --- Derivados (puros) --------------------------------------------

/** Suma de una lista de pagos. */
export function sumPayments(payments: Payment[]): number {
  return payments.reduce((total, p) => total + p.amount, 0)
}

/**
 * Saldo actual de una deuda: el saldo de apertura menos lo abonado.
 * Puede dar 0 o negativo si hubo sobrepago; la interfaz muestra 0 y "Saldada".
 */
export function debtBalance(debt: Debt, payments: Payment[]): number {
  return debt.openingBalance - sumPayments(payments)
}
