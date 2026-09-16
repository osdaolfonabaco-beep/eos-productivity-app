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
import { fixedExpenseIdsWithExpenseInRange, listExpenses, sumExpenses } from './expenses'
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
import type { Expense, FixedExpense, Income, Payment, SalaryPeriod } from './types'

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
 * Los sueldos registrados con `periodStart` entre `start` y `end`, ambos
 * incluidos, en una sola consulta — para cuando hace falta el sueldo de
 * varias quincenas a la vez (el histórico de Movimientos) y pedirlo
 * quincena por quincena sería una consulta de más por cada una.
 */
export async function listSalaryPeriods(start: string, end: string): Promise<SalaryPeriod[]> {
  const rows = unwrap(
    await supabase
      .from('salary_periods')
      .select(SALARY_PERIOD_COLS)
      .gte('period_start', start)
      .lte('period_start', end)
      .eq('archived', false)
      .order('period_start', { ascending: true }),
    'listSalaryPeriods',
  )
  return rows.map(rowToSalaryPeriod)
}

/**
 * Registra el sueldo de una quincena, o lo corrige si ya había uno (una fila
 * por `periodStart`).
 *
 * EXCEPCIÓN DELIBERADA al patrón de archivado del resto de la app: esta
 * función SÍ reactiva una fila archivada (le pone `archived: false`), algo
 * que ninguna otra función de este proyecto hace. Por qué: `salary_periods`
 * tiene `unique (user_id, period_start)` SIN filtrar por `archived` — a
 * diferencia de `savings_goal`, que sí usa un índice único parcial
 * (`where not archived`). Eso significa que si se quita el sueldo de una
 * quincena (`archiveSalaryPeriod`), la fila archivada sigue ocupando esa
 * `period_start` para siempre. Si esta función buscara solo entre las no
 * archivadas (como `getSalaryPeriod`), no encontraría esa fila y trataría de
 * INSERTAR una nueva con la misma `period_start` — y esa restricción única
 * la rechazaría. Por eso busca CUALQUIER fila con ese `period_start`, sin
 * filtrar por `archived`, y si la encuentra la reactiva y corrige en vez de
 * insertar. NO "corrijas" esto volviendo a filtrar por `archived: false`:
 * eso reintroduce el fallo de no poder volver a poner un sueldo que se quitó.
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

  const existingRows = unwrap(
    await supabase
      .from('salary_periods')
      .select(SALARY_PERIOD_COLS)
      .eq('period_start', periodStart)
      .limit(1),
    'setSalaryAmount (buscar)',
  )
  const existing = existingRows[0]

  if (existing) {
    const rows = unwrap(
      await supabase
        .from('salary_periods')
        .update({ period_end: periodEnd, amount: roundedAmount, archived: false })
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

/**
 * Quita el sueldo de una quincena (el botón dice "Quitar sueldo"; por dentro
 * archiva, no borra — mismo patrón que el resto de la app). Afecta solo a
 * esta fila, o sea solo a esa quincena. Idempotente. Ver el comentario de
 * `setSalaryAmount` para cómo se vuelve a poner después.
 */
export async function archiveSalaryPeriod(id: string): Promise<void> {
  const res = await supabase.from('salary_periods').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveSalaryPeriod: ${res.error.message}`)
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
  /** Los gastos reales (tabla `expenses`) con fecha dentro de este período. */
  expenses: Expense[]
  expensesTotal: number
  /**
   * Las plantillas de gastos fijos que aplican a esta quincena y que
   * TODAVÍA NO tienen un gasto real asociado en ella (ver el comentario de
   * `getPeriodBreakdown` para el porqué de "pendiente").
   */
  pendingFixedExpenses: FixedExpense[]
  pendingFixedExpensesTotal: number
  debtPayments: Payment[]
  debtPaymentsTotal: number
  /** Sueldo (0 si no hay) + ingresos extra − gastos reales − pagos a deudas. Puede dar negativo. */
  available: number
  /** `available` menos lo que falta pagar de las plantillas de gastos fijos. Puede dar negativo. */
  projected: number
}

/**
 * El desglose completo de una quincena: sueldo, ingresos extra, gastos
 * reales y pagos a deudas hechos dentro de ese rango, más la proyección de
 * gastos fijos pendientes. Todo se calcula aquí; nada de esto se guarda.
 *
 * ────────────────────────────────────────────────────────────────────────
 * EL MODELO — léelo entero antes de tocar esta función.
 *
 * `fixed_expenses` es una PLANTILLA: lo que esperas gastar cada quincena
 * (arriendo, streaming, etc.), no un hecho. Por eso ya NO se resta de
 * `available` — hacerlo sumaría un gasto que quizás todavía no ocurrió, o
 * que ya ocurrió pero con un monto distinto al de la plantilla.
 *
 * `expenses` es lo REAL: cada fila es un gasto que de verdad pasó, con su
 * fecha y su monto exactos (algunos vienen de una plantilla vía
 * `fixedExpenseId`, otros son sueltos). `available` resta esto, y solo
 * esto — es la cifra "cuánta plata tengo de verdad ahora mismo", y
 * cualquier cosa que no haya ocurrido todavía no puede restar de un hecho.
 *
 *   available = sueldo + ingresos extra − gastos reales − pagos a deudas
 *
 * El problema de quedarse solo con `available`: si todavía no has pagado el
 * arriendo de esta quincena, `available` no lo sabe, y el número parece más
 * alto de lo que en la práctica vas a poder gastar. Para eso existe
 * `projected`: toma `available` y le resta el total de las plantillas que
 * aplican a esta quincena (`fixedExpensesForQuincena`) y que TODAVÍA no
 * tienen un gasto real que las cubra (`pendingFixedExpenses`, deducido con
 * `fixedExpenseIdsWithExpenseInRange` — nunca guardado, siempre recalculado
 * a partir de `expenses`).
 *
 *   projected = available − total de plantillas pendientes de esta quincena
 *
 * Si ya se pagaron todos los gastos fijos de la quincena, `pendingFixedExpenses`
 * queda vacío y `projected === available`: las dos cifras coinciden porque ya
 * no queda nada pendiente que proyectar.
 *
 * LA TRAMPA para dentro de un año: NUNCA restar `fixedExpensesTotal` (el
 * total de la plantilla completa) de `available` — eso es volver al modelo
 * viejo, donde un gasto fijo ya pagado se restaba dos veces (una como
 * plantilla, otra como gasto real). Los gastos fijos SOLO entran en
 * `projected`, y solo la parte pendiente.
 * ────────────────────────────────────────────────────────────────────────
 */
export async function getPeriodBreakdown(
  periodStart: string,
  periodEnd: string,
): Promise<PeriodBreakdown> {
  const label = quincenaLabel(periodStart)

  const [salary, incomes, expenses, allFixedExpenses, paidFixedExpenseIds, debtPayments] =
    await Promise.all([
      getSalaryPeriod(periodStart),
      listIncomes(periodStart, periodEnd),
      listExpenses(periodStart, periodEnd),
      listFixedExpenses(),
      fixedExpenseIdsWithExpenseInRange(periodStart, periodEnd),
      getPaymentsInRange(periodStart, periodEnd),
    ])

  const incomesTotal = sumIncomes(incomes)
  const expensesTotal = sumExpenses(expenses)
  const fixedExpensesForThisQuincena = fixedExpensesForQuincena(allFixedExpenses, label)
  const pendingFixedExpenses = fixedExpensesForThisQuincena.filter(
    (e) => !paidFixedExpenseIds.has(e.id),
  )
  const pendingFixedExpensesTotal = sumFixedExpenses(pendingFixedExpenses)
  const debtPaymentsTotal = debtPayments.reduce((total, p) => total + p.amount, 0)

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
  const available = (salary?.amount ?? 0) + incomesTotal - expensesTotal - debtPaymentsTotal
  const projected = available - pendingFixedExpensesTotal

  return {
    salary,
    incomes,
    incomesTotal,
    expenses,
    expensesTotal,
    pendingFixedExpenses,
    pendingFixedExpensesTotal,
    debtPayments,
    debtPaymentsTotal,
    available,
    projected,
  }
}
