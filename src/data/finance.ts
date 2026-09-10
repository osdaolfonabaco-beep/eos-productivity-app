/**
 * El módulo de datos de finanzas: deudas y pagos.
 *
 * Mismo criterio que hábitos: el acceso crudo vive en `storage.ts`, no hay
 * estado en memoria y el saldo actual de una deuda no se guarda, se deriva.
 */

import { isISODate } from './dates'
import { newId, readList, writeList } from './storage'
import type { Debt, DebtStatus, Payment } from './types'

const DEBTS_KEY = 'productividad.debts'
const PAYMENTS_KEY = 'productividad.payments'

/** Los campos que la interfaz puede fijar al crear o editar una deuda. */
export interface DebtInput {
  name: string
  openingBalance: number
  annualRate: number | null
  monthlyPayment: number
  status: DebtStatus
}

// --- Deudas ------------------------------------------------------------

/** Todas las deudas, archivadas incluidas, ordenadas por `order`. Uso interno. */
function allDebts(): Debt[] {
  return readList<Debt>(DEBTS_KEY).sort((a, b) => a.order - b.order)
}

/** Las deudas activas (no archivadas), ordenadas por `order`. */
export function listDebts(): Debt[] {
  return allDebts().filter((d) => !d.archived)
}

/** Una deuda por id, o `undefined`. Incluye las archivadas. */
export function getDebt(id: string): Debt | undefined {
  return allDebts().find((d) => d.id === id)
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
function normalize(input: DebtInput): Omit<Debt, 'id' | 'createdAt' | 'archived' | 'order'> {
  return {
    name: input.name.trim(),
    openingBalance: Math.round(input.openingBalance),
    annualRate: input.annualRate,
    monthlyPayment: Math.max(0, Math.round(input.monthlyPayment || 0)),
    status: input.status,
  }
}

/** Crea una deuda activa. El saldo pasado es el punto de partida (`openingBalance`). */
export function createDebt(input: DebtInput): Debt {
  assertValidInput(input)

  const debts = allDebts()
  const maxOrder = debts.reduce((max, d) => Math.max(max, d.order), -1)
  const debt: Debt = {
    id: newId(),
    ...normalize(input),
    createdAt: new Date().toISOString(),
    archived: false,
    order: maxOrder + 1,
  }
  writeList(DEBTS_KEY, [...debts, debt])
  return debt
}

/**
 * Edita una deuda. Cambiar `openingBalance` es una corrección del punto de
 * partida; no toca los pagos.
 */
export function updateDebt(id: string, input: DebtInput): Debt {
  assertValidInput(input)

  const debts = allDebts()
  const debt = debts.find((d) => d.id === id)
  if (!debt) throw new Error(`No existe la deuda ${id}`)

  const updated: Debt = { ...debt, ...normalize(input) }
  writeList(
    DEBTS_KEY,
    debts.map((d) => (d.id === id ? updated : d)),
  )
  return updated
}

/**
 * Archiva una deuda. Es lo que hace el botón "Archivar deuda": la deuda y sus
 * pagos se conservan, solo deja de aparecer en la lista. Idempotente.
 */
export function archiveDebt(id: string): void {
  const debts = allDebts()
  const debt = debts.find((d) => d.id === id)
  if (!debt) throw new Error(`No existe la deuda ${id}`)
  if (debt.archived) return

  writeList(
    DEBTS_KEY,
    debts.map((d) => (d.id === id ? { ...d, archived: true } : d)),
  )
}

// --- Pagos -----------------------------------------------------------

function allPayments(): Payment[] {
  return readList<Payment>(PAYMENTS_KEY)
}

/** Los pagos de una deuda, del más reciente al más antiguo. */
export function getPayments(debtId: string): Payment[] {
  return allPayments()
    .filter((p) => p.debtId === debtId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Registra un pago. `date` en `YYYY-MM-DD`; `amount` en pesos, entero > 0. */
export function addPayment(debtId: string, date: string, amount: number): Payment {
  if (!isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El monto del pago debe ser mayor que cero')
  }

  const payments = allPayments()
  const payment: Payment = { id: newId(), debtId, date, amount: Math.round(amount) }
  writeList(PAYMENTS_KEY, [...payments, payment])
  return payment
}

/**
 * Borra un pago entero. La única operación que quita algo del historial, y la
 * interfaz siempre la pide con confirmación. Si no hay tal pago, no hace nada.
 */
export function deletePayment(id: string): void {
  const payments = allPayments()
  const next = payments.filter((p) => p.id !== id)
  if (next.length !== payments.length) writeList(PAYMENTS_KEY, next)
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
