/**
 * El módulo de datos de períodos de sueldo (quincenas), contra Supabase.
 *
 * El disponible de un período no se guarda: se recalcula en cada lectura a
 * partir del sueldo registrado, los gastos fijos que aplican a esa quincena
 * (`fixedExpenses.ts`) y los pagos a deudas con fecha dentro del período
 * (tabla `payments`, ya existente — aquí solo se lee; el módulo de deudas no
 * se toca).
 */

import { isISODate, quincenaLabel } from './dates'
import { fixedExpensesForQuincena, listFixedExpenses, sumFixedExpenses } from './fixedExpenses'
import { listIncomes, sumIncomes } from './incomes'
import {
  PAYMENT_COLS,
  rowToPayment,
  rowToSalaryPeriod,
  SALARY_PERIOD_COLS,
  salaryPeriodToRow,
} from './rows'
import { supabase, unwrap } from './supabase'
import type { FixedExpense, Income, Payment, SalaryPeriod } from './types'

/** El sueldo registrado para la quincena que empieza en `periodStart`, o `undefined`. */
export async function getSalaryPeriod(periodStart: string): Promise<SalaryPeriod | undefined> {
  const rows = unwrap(
    await supabase
      .from('salary_periods')
      .select(SALARY_PERIOD_COLS)
      .eq('period_start', periodStart)
      .eq('archived', false)
      .limit(1),
    'getSalaryPeriod',
  )
  return rows[0] ? rowToSalaryPeriod(rows[0]) : undefined
}

/**
 * Registra el sueldo de una quincena, o lo corrige si ya había uno (una fila
 * por `periodStart`).
 */
export async function setSalaryAmount(
  periodStart: string,
  periodEnd: string,
  amount: number,
): Promise<SalaryPeriod> {
  if (!isISODate(periodStart) || !isISODate(periodEnd)) {
    throw new Error(`Fechas de período inválidas: ${periodStart} – ${periodEnd}`)
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El sueldo debe ser mayor que cero')
  }
  const roundedAmount = Math.round(amount)

  const existing = await getSalaryPeriod(periodStart)
  if (existing) {
    const rows = unwrap(
      await supabase
        .from('salary_periods')
        .update({ amount: roundedAmount })
        .eq('id', existing.id)
        .select(SALARY_PERIOD_COLS),
      'setSalaryAmount (editar)',
    )
    return rowToSalaryPeriod(rows[0])
  }

  const period: SalaryPeriod = {
    id: crypto.randomUUID(),
    periodStart,
    periodEnd,
    amount: roundedAmount,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('salary_periods').insert(salaryPeriodToRow(period)).select(SALARY_PERIOD_COLS),
    'setSalaryAmount (crear)',
  )
  return rowToSalaryPeriod(rows[0])
}

// --- Disponible del período (derivado) --------------------------------

/** Los pagos a cualquier deuda con fecha entre `start` y `end`, ambos incluidos. */
async function getPaymentsInRange(start: string, end: string): Promise<Payment[]> {
  const rows = unwrap(
    await supabase
      .from('payments')
      .select(PAYMENT_COLS)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false }),
    'getPaymentsInRange',
  )
  return rows.map(rowToPayment)
}

/** El desglose del disponible de un período: cada pieza, visible por separado. */
export interface PeriodBreakdown {
  /** `undefined` si aún no se ha registrado el sueldo de esta quincena. */
  salary: SalaryPeriod | undefined
  incomes: Income[]
  incomesTotal: number
  fixedExpenses: FixedExpense[]
  fixedExpensesTotal: number
  debtPayments: Payment[]
  debtPaymentsTotal: number
  /** Sueldo (0 si no hay) + ingresos extra − gastos fijos aplicables − pagos a deudas. Puede dar negativo. */
  available: number
}

/**
 * El desglose completo de una quincena: sueldo, ingresos extra, gastos fijos
 * que le aplican y pagos a deudas hechos dentro de ese rango. Todo se calcula
 * aquí; nada de esto se guarda.
 */
export async function getPeriodBreakdown(
  periodStart: string,
  periodEnd: string,
): Promise<PeriodBreakdown> {
  const label = quincenaLabel(periodStart)

  const [salary, incomes, allFixedExpenses, debtPayments] = await Promise.all([
    getSalaryPeriod(periodStart),
    listIncomes(periodStart, periodEnd),
    listFixedExpenses(),
    getPaymentsInRange(periodStart, periodEnd),
  ])

  const incomesTotal = sumIncomes(incomes)
  const fixedExpenses = fixedExpensesForQuincena(allFixedExpenses, label)
  const fixedExpensesTotal = sumFixedExpenses(fixedExpenses)
  const debtPaymentsTotal = debtPayments.reduce((total, p) => total + p.amount, 0)

  return {
    salary,
    incomes,
    incomesTotal,
    fixedExpenses,
    fixedExpensesTotal,
    debtPayments,
    debtPaymentsTotal,
    // OJO al volver a este archivo dentro de un año: el sueldo vive en
    // `salary_periods`, nunca en `incomes` (ver el comentario en la cabecera
    // de incomes.ts). `salary?.amount ?? 0` es la ÚNICA vez que el sueldo
    // entra en esta cuenta — si `incomes` alguna vez empezara a incluir el
    // sueldo, hay que QUITARLO de aquí, no sumarlo también: sumar las dos
    // fuentes duplicaría el sueldo y el disponible saldría inflado.
    // Sin sueldo registrado, cuenta como 0 (no como "disponible = 0"): con
    // ingresos extra y sin sueldo el resultado puede ser positivo, y con
    // gastos/pagos que superan lo que sí entró puede dar negativo — los dos
    // casos son correctos y PeriodSection ya pinta el negativo en rojo.
    available: (salary?.amount ?? 0) + incomesTotal - fixedExpensesTotal - debtPaymentsTotal,
  }
}
