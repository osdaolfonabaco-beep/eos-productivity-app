import { useCallback, useState } from 'react'
import {
  addDays,
  archiveExpense,
  archiveIncome,
  createExpense,
  createIncome,
  getPeriodBreakdown,
  listExpenses,
  listIncomes,
  listSalaryPeriods,
  quincenaLabel,
  quincenaRange,
  sumExpenses,
  sumIncomes,
  todayISO,
  updateExpense,
  updateIncome,
  type Expense,
  type FixedExpense,
  type Income,
  type SalaryPeriod,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import MovementCategoryBreakdown from './MovementCategoryBreakdown'
import MovementListSection from './MovementListSection'
import MovementSummaryCard from './MovementSummaryCard'
import { type MovementQuincenaTotal } from './MovementQuincenaChart'
import { ActionError, LoadError, Loading } from './ViewState'

/** Cuántas quincenas muestra el gráfico de entradas y salidas (la actual incluida). */
const HISTORY_LENGTH = 6

interface MovementsData {
  currentSalary: SalaryPeriod | undefined
  currentIncomes: Income[]
  currentExpenses: Expense[]
  pendingFixedExpenses: FixedExpense[]
  history: MovementQuincenaTotal[]
  /** Categorías de ingreso ya usadas en las últimas `HISTORY_LENGTH` quincenas, para sugerir. */
  incomeCategorySuggestions: string[]
  /** Categorías de gasto ya usadas en las últimas `HISTORY_LENGTH` quincenas, para sugerir. */
  expenseCategorySuggestions: string[]
}

const QUINCENA_TITLE: Record<'primera' | 'segunda', string> = {
  primera: 'Primera quincena',
  segunda: 'Segunda quincena',
}

const arrowButtonClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-30'

/** `2026-09-16` → `16 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * La vista "Movimientos": entró/salió/diferencia de la quincena visitada con
 * el histórico de las últimas 6, el reparto por categoría de cada lado, y
 * una sola lista cronológica con el sueldo, los ingresos y los gastos
 * reales, más las plantillas de gastos fijos aún sin pagar.
 *
 * Una sola llamada a `getPeriodBreakdown` para la quincena visitada (ya
 * trae sueldo, ingresos, gastos reales y pendientes, todo verificado — no
 * se toca ni se repite ese cálculo). El histórico de 6 quincenas NO usa
 * `getPeriodBreakdown` seis veces: eso repetiría consultas de gastos fijos
 * y pagos a deudas que el gráfico no necesita. En su lugar, una consulta de
 * rango por tabla (sueldos, ingresos, gastos) que cubre las 6 quincenas de
 * una vez, repartida por quincena en memoria — mismo patrón que ya usaba
 * `IncomesView`, extendido a sueldos (antes se pedía uno por quincena) y a
 * gastos.
 *
 * Navegación entre quincenas igual que en Sueldo (sin límite hacia atrás,
 * nunca hacia el futuro).
 */
export default function MovementsView() {
  const [viewedDate, setViewedDate] = useState(todayISO())
  const { start: periodStart, end: periodEnd } = quincenaRange(viewedDate)
  const { start: todayPeriodStart } = quincenaRange(todayISO())
  const isCurrentPeriod = periodStart === todayPeriodStart
  // Nunca se pueden anotar movimientos "del futuro" dentro de la quincena en
  // curso; en una quincena pasada, el rango entero ya es pasado.
  const maxDate = periodEnd < todayISO() ? periodEnd : todayISO()

  const fetcher = useCallback(async (): Promise<MovementsData> => {
    // Las últimas HISTORY_LENGTH quincenas, de la más antigua a la actual
    // (última), caminando hacia atrás con quincenaRange/addDays.
    const periods: { start: string; end: string }[] = []
    let cursor = periodStart
    for (let i = 0; i < HISTORY_LENGTH; i++) {
      const range = quincenaRange(cursor)
      periods.push(range)
      cursor = addDays(range.start, -1)
    }
    periods.reverse()

    const [breakdown, salariesInRange, incomesInRange, expensesInRange] = await Promise.all([
      getPeriodBreakdown(periodStart, periodEnd),
      listSalaryPeriods(periods[0].start, periodEnd),
      listIncomes(periods[0].start, periodEnd),
      listExpenses(periods[0].start, periodEnd),
    ])

    const salaryByStart = new Map(salariesInRange.map((s) => [s.periodStart, s]))

    const history: MovementQuincenaTotal[] = periods.map((p) => ({
      start: p.start,
      entrada:
        (salaryByStart.get(p.start)?.amount ?? 0) +
        sumIncomes(incomesInRange.filter((inc) => inc.date >= p.start && inc.date <= p.end)),
      salida: sumExpenses(expensesInRange.filter((exp) => exp.date >= p.start && exp.date <= p.end)),
      isCurrent: p.start === periodStart,
    }))

    const incomeCategorySuggestions = [
      ...new Set(incomesInRange.map((inc) => inc.category).filter((c): c is string => c !== null)),
    ]
    const expenseCategorySuggestions = [
      ...new Set(expensesInRange.map((exp) => exp.category).filter((c): c is string => c !== null)),
    ]

    return {
      currentSalary: breakdown.salary,
      currentIncomes: breakdown.incomes,
      currentExpenses: breakdown.expenses,
      pendingFixedExpenses: breakdown.pendingFixedExpenses,
      history,
      incomeCategorySuggestions,
      expenseCategorySuggestions,
    }
  }, [periodStart, periodEnd])

  const { data, loading, error, reload } = useAsyncData(fetcher, [periodStart, periodEnd])

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
    } catch {
      setActionError(message)
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />
  if (!data) return null

  const {
    currentSalary,
    currentIncomes,
    currentExpenses,
    pendingFixedExpenses,
    history,
    incomeCategorySuggestions,
    expenseCategorySuggestions,
  } = data
  const entrada = (currentSalary?.amount ?? 0) + sumIncomes(currentIncomes)
  const salida = sumExpenses(currentExpenses)

  return (
    <main className="px-4 pb-6 pt-4 text-texto">
      {actionError && <ActionError message={actionError} onDismiss={() => setActionError(null)} />}

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setViewedDate(addDays(periodStart, -1))}
            aria-label="Quincena anterior"
            className={arrowButtonClass}
          >
            ‹
          </button>

          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-sm font-semibold text-texto-cuerpo">
              {QUINCENA_TITLE[quincenaLabel(periodStart)]} · {formatShortDate(periodStart)} –{' '}
              {formatShortDate(periodEnd)}
            </h2>
            {!isCurrentPeriod && (
              <button
                type="button"
                onClick={() => setViewedDate(todayISO())}
                className="mt-0.5 text-xs font-medium text-texto-apagado underline underline-offset-2"
              >
                Quincena pasada · Volver a hoy
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (!isCurrentPeriod) setViewedDate(addDays(periodEnd, 1))
            }}
            disabled={isCurrentPeriod}
            aria-label="Quincena siguiente"
            className={arrowButtonClass}
          >
            ›
          </button>
        </div>

        <MovementSummaryCard key={periodStart} entrada={entrada} salida={salida} history={history} />
      </section>

      <MovementCategoryBreakdown
        incomes={currentIncomes}
        expenses={currentExpenses}
        salaryAmount={currentSalary?.amount ?? 0}
      />

      <MovementListSection
        key={periodStart}
        salary={currentSalary}
        incomes={currentIncomes}
        expenses={currentExpenses}
        pendingFixedExpenses={pendingFixedExpenses}
        incomeCategorySuggestions={incomeCategorySuggestions}
        expenseCategorySuggestions={expenseCategorySuggestions}
        minDate={periodStart}
        maxDate={maxDate}
        busy={busy}
        onCreateIncome={(input) => void run(() => createIncome(input), 'No se pudo anotar el ingreso.')}
        onUpdateIncome={(id, input) =>
          void run(() => updateIncome(id, input), 'No se pudo guardar el ingreso.')
        }
        onArchiveIncome={(id) => void run(() => archiveIncome(id), 'No se pudo archivar el ingreso.')}
        onCreateExpense={(input) => void run(() => createExpense(input), 'No se pudo anotar el gasto.')}
        onUpdateExpense={(id, input) =>
          void run(() => updateExpense(id, input), 'No se pudo guardar el gasto.')
        }
        onArchiveExpense={(id) => void run(() => archiveExpense(id), 'No se pudo archivar el gasto.')}
      />
    </main>
  )
}
