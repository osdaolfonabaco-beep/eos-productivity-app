import { useCallback, useState } from 'react'
import {
  addContribution,
  addDays,
  archiveContribution,
  archiveFixedExpense,
  archiveSavingsGoal,
  createFixedExpense,
  createSavingsGoal,
  getActiveSavingsGoal,
  getPeriodBreakdown,
  listContributions,
  listFixedExpenses,
  quincenaLabel,
  quincenaRange,
  setSalaryAmount,
  todayISO,
  updateFixedExpense,
  updateSavingsGoal,
  type FixedExpense,
  type PeriodBreakdown,
  type SavingsContribution,
  type SavingsGoal,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import FixedExpensesSection from './FixedExpensesSection'
import PeriodSection from './PeriodSection'
import SavingsGoalSection from './SavingsGoalSection'
import { ActionError, LoadError, Loading } from './ViewState'

interface SalaryData {
  breakdown: PeriodBreakdown
  fixedExpenses: FixedExpense[]
  goal: SavingsGoal | undefined
  contributions: SavingsContribution[]
}

/**
 * La vista "Sueldo": período actual, gastos fijos y meta de ahorro.
 *
 * Una sola carga de datos para las tres secciones, en vez de que cada una
 * pida lo suyo por separado: los gastos fijos alimentan el disponible del
 * período, así que editarlos en su sección tiene que refrescar también el
 * desglose de arriba. Las tres secciones son presentacionales — reciben sus
 * datos y avisan con callbacks; toda la carga y las mutaciones viven aquí.
 *
 * Se puede navegar entre quincenas (sin límite hacia atrás, nunca hacia el
 * futuro). La meta de ahorro y sus aportes no dependen del período visitado
 * — se cargan una sola vez y no cambian al navegar.
 */
export default function SalaryView() {
  const [viewedDate, setViewedDate] = useState(todayISO())
  const { start: periodStart, end: periodEnd } = quincenaRange(viewedDate)
  const { start: todayPeriodStart } = quincenaRange(todayISO())
  const isCurrentPeriod = periodStart === todayPeriodStart

  const fetcher = useCallback(async (): Promise<SalaryData> => {
    const [breakdown, fixedExpenses, goal] = await Promise.all([
      getPeriodBreakdown(periodStart, periodEnd),
      listFixedExpenses(),
      getActiveSavingsGoal(),
    ])
    const contributions = goal ? await listContributions(goal.id) : []
    return { breakdown, fixedExpenses, goal, contributions }
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

  const { breakdown, fixedExpenses, goal, contributions } = data
  const periodLabel = quincenaLabel(periodStart)

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      {actionError && <ActionError message={actionError} onDismiss={() => setActionError(null)} />}

      <PeriodSection
        key={periodStart}
        periodStart={periodStart}
        periodEnd={periodEnd}
        breakdown={breakdown}
        busy={busy}
        isCurrentPeriod={isCurrentPeriod}
        onPrevious={() => setViewedDate(addDays(periodStart, -1))}
        onNext={() => {
          if (!isCurrentPeriod) setViewedDate(addDays(periodEnd, 1))
        }}
        onGoToToday={() => setViewedDate(todayISO())}
        onSetSalary={(amount) =>
          void run(
            () => setSalaryAmount(periodStart, periodEnd, amount),
            'No se pudo guardar el sueldo.',
          )
        }
      />

      <FixedExpensesSection
        expenses={fixedExpenses}
        periodLabel={periodLabel}
        busy={busy}
        onCreate={(input) => void run(() => createFixedExpense(input), 'No se pudo crear el gasto.')}
        onUpdate={(id, input) =>
          void run(() => updateFixedExpense(id, input), 'No se pudo guardar el gasto.')
        }
        onArchive={(id) => void run(() => archiveFixedExpense(id), 'No se pudo eliminar el gasto.')}
      />

      <SavingsGoalSection
        goal={goal}
        contributions={contributions}
        busy={busy}
        onCreate={(input) => void run(() => createSavingsGoal(input), 'No se pudo crear la meta.')}
        onUpdate={(id, input) =>
          void run(() => updateSavingsGoal(id, input), 'No se pudo guardar la meta.')
        }
        onArchive={(id) => void run(() => archiveSavingsGoal(id), 'No se pudo archivar la meta.')}
        onAddContribution={(goalId, date, amount) =>
          void run(() => addContribution(goalId, date, amount), 'No se pudo anotar el aporte.')
        }
        onArchiveContribution={(id) =>
          void run(() => archiveContribution(id), 'No se pudo archivar el aporte.')
        }
      />
    </main>
  )
}
