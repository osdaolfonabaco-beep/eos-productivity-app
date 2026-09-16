import { useCallback, useState } from 'react'
import {
  addDays,
  archiveIncome,
  createIncome,
  getSalaryPeriod,
  listIncomes,
  quincenaLabel,
  quincenaRange,
  sumIncomes,
  todayISO,
  updateIncome,
  type Income,
  type SalaryPeriod,
} from '../data'
import { formatCOP } from '../money'
import { useAsyncData } from '../useAsyncData'
import IncomeCategoryBreakdown from './IncomeCategoryBreakdown'
import IncomeListSection from './IncomeListSection'
import IncomeQuincenaChart, { type QuincenaTotal } from './IncomeQuincenaChart'
import { ActionError, LoadError, Loading } from './ViewState'

/** Cuántas quincenas muestra el gráfico de "Entró esta quincena" (la actual incluida). */
const HISTORY_LENGTH = 6

interface IncomesData {
  currentSalary: SalaryPeriod | undefined
  currentIncomes: Income[]
  history: QuincenaTotal[]
  /** Categorías ya usadas en las últimas `HISTORY_LENGTH` quincenas, para sugerir. */
  categorySuggestions: string[]
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
 * La vista "Ingresos": lo que entró en la quincena visitada (sueldo + extras,
 * con el histórico de las últimas 6), de dónde vino por categoría, y la lista
 * para anotar ingresos sueltos. El sueldo NUNCA se guarda en `incomes` —
 * aquí se muestra como una fila sintética calculada al leer (ver
 * `IncomeListSection`); si no hay sueldo registrado, esa fila no aparece.
 *
 * Navegación entre quincenas igual que en Sueldo (sin límite hacia atrás,
 * nunca hacia el futuro).
 */
export default function IncomesView() {
  const [viewedDate, setViewedDate] = useState(todayISO())
  const { start: periodStart, end: periodEnd } = quincenaRange(viewedDate)
  const { start: todayPeriodStart } = quincenaRange(todayISO())
  const isCurrentPeriod = periodStart === todayPeriodStart
  // Nunca se pueden anotar ingresos "del futuro" dentro de la quincena en
  // curso; en una quincena pasada, el rango entero ya es pasado.
  const maxIncomeDate = periodEnd < todayISO() ? periodEnd : todayISO()

  const fetcher = useCallback(async (): Promise<IncomesData> => {
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

    const [salaries, incomesInRange] = await Promise.all([
      Promise.all(periods.map((p) => getSalaryPeriod(p.start))),
      // Un solo pedido de ingresos que cubre las 6 quincenas, en vez de seis
      // pedidos separados; se reparte por quincena a continuación.
      listIncomes(periods[0].start, periodEnd),
    ])

    const history: QuincenaTotal[] = periods.map((p, i) => ({
      start: p.start,
      total:
        (salaries[i]?.amount ?? 0) +
        sumIncomes(incomesInRange.filter((inc) => inc.date >= p.start && inc.date <= p.end)),
      isCurrent: p.start === periodStart,
    }))

    const currentIncomes = incomesInRange.filter(
      (inc) => inc.date >= periodStart && inc.date <= periodEnd,
    )
    const categorySuggestions = [
      ...new Set(
        incomesInRange
          .map((inc) => inc.category)
          .filter((c): c is string => c !== null),
      ),
    ]

    return {
      currentSalary: salaries[salaries.length - 1],
      currentIncomes,
      history,
      categorySuggestions,
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

  const { currentSalary, currentIncomes, history, categorySuggestions } = data
  const extrasTotal = sumIncomes(currentIncomes)
  const total = (currentSalary?.amount ?? 0) + extrasTotal

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

        <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
          <div
            className="p-4"
            style={{ background: 'linear-gradient(to bottom, var(--color-hecho-lavado), white)' }}
          >
            <h3 className="text-etiqueta uppercase text-texto-tenue">Entró esta quincena</h3>
            <p className="mt-1 text-destacado tabular-nums text-hecho">{formatCOP(total)}</p>
            <p className="mt-1 text-meta text-texto-apagado">
              Sueldo {formatCOP(currentSalary?.amount ?? 0)} · Extras {formatCOP(extrasTotal)}
            </p>
          </div>
          <div className="border-t-[0.5px] border-separador p-4">
            <IncomeQuincenaChart key={periodStart} history={history} />
          </div>
        </div>
      </section>

      <IncomeCategoryBreakdown incomes={currentIncomes} salaryAmount={currentSalary?.amount ?? 0} />

      <IncomeListSection
        key={periodStart}
        salary={currentSalary}
        incomes={currentIncomes}
        categorySuggestions={categorySuggestions}
        minDate={periodStart}
        maxDate={maxIncomeDate}
        busy={busy}
        onCreate={(input) => void run(() => createIncome(input), 'No se pudo anotar el ingreso.')}
        onUpdate={(id, input) =>
          void run(() => updateIncome(id, input), 'No se pudo guardar el ingreso.')
        }
        onArchive={(id) => void run(() => archiveIncome(id), 'No se pudo archivar el ingreso.')}
      />
    </main>
  )
}
