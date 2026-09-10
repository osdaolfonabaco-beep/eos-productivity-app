import { useCallback, useState } from 'react'
import {
  createDebt,
  debtBalance,
  getPayments,
  listDebts,
  sumPayments,
  updateDebt,
  type Debt,
  type DebtInput,
} from '../data'
import { formatCOP, formatRate } from '../money'
import { useAsyncData } from '../useAsyncData'
import DebtDetail from './DebtDetail'
import DebtForm from './DebtForm'
import DebtStatusChip from './DebtStatusChip'
import { ActionError, LoadError, Loading } from './ViewState'

/** Navegación interna de la pestaña, sin librería de rutas. */
type Screen =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; debtId: string }
  | { name: 'edit'; debtId: string }

interface Row {
  debt: Debt
  balance: number
  paid: number
}

function FormScreen({
  title,
  initial,
  busy,
  error,
  onDismissError,
  onSubmit,
  onCancel,
}: {
  title: string
  initial?: Debt
  busy: boolean
  error: string | null
  onDismissError: () => void
  onSubmit: (values: DebtInput) => void
  onCancel: () => void
}) {
  return (
    <main className="px-4 py-6 text-gray-900">
      <button type="button" onClick={onCancel} className="text-sm text-gray-600">
        ‹ Deudas
      </button>
      <h1 className="mb-4 mt-3 text-2xl font-semibold">{title}</h1>
      {error && <ActionError message={error} onDismiss={onDismissError} />}
      <fieldset disabled={busy} className="disabled:opacity-60">
        <DebtForm initial={initial} onSubmit={onSubmit} onCancel={onCancel} />
      </fieldset>
    </main>
  )
}

export default function DebtsView() {
  const [screen, setScreen] = useState<Screen>({ name: 'list' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetcher = useCallback(async (): Promise<Row[]> => {
    const debts = await listDebts()
    const paymentsByDebt = await Promise.all(debts.map((d) => getPayments(d.id)))
    return debts.map((debt, i) => ({
      debt,
      balance: debtBalance(debt, paymentsByDebt[i]),
      paid: sumPayments(paymentsByDebt[i]),
    }))
  }, [])

  const { data, loading, error, reload } = useAsyncData(fetcher)
  const rows = data ?? []

  async function save(action: () => Promise<unknown>, then: () => void) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      then()
      reload()
    } catch {
      setActionError('No se pudo guardar. Revisa la conexión.')
    } finally {
      setBusy(false)
    }
  }

  if (screen.name === 'new') {
    return (
      <FormScreen
        title="Nueva deuda"
        busy={busy}
        error={actionError}
        onDismissError={() => setActionError(null)}
        onCancel={() => setScreen({ name: 'list' })}
        onSubmit={(values) =>
          void save(
            () => createDebt(values),
            () => setScreen({ name: 'list' }),
          )
        }
      />
    )
  }

  if (screen.name === 'edit') {
    const initial = rows.find((r) => r.debt.id === screen.debtId)?.debt
    const backToDetail = () => setScreen({ name: 'detail', debtId: screen.debtId })
    return (
      <FormScreen
        title="Editar deuda"
        initial={initial}
        busy={busy}
        error={actionError}
        onDismissError={() => setActionError(null)}
        onCancel={backToDetail}
        onSubmit={(values) =>
          void save(() => updateDebt(screen.debtId, values), backToDetail)
        }
      />
    )
  }

  if (screen.name === 'detail') {
    return (
      <DebtDetail
        debtId={screen.debtId}
        onBack={() => setScreen({ name: 'list' })}
        onEdit={() => setScreen({ name: 'edit', debtId: screen.debtId })}
      />
    )
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const totalBalance = rows.reduce((t, r) => t + Math.max(0, r.balance), 0)
  const totalPaid = rows.reduce((t, r) => t + r.paid, 0)
  const totalOpening = rows.reduce((t, r) => t + r.debt.openingBalance, 0)
  const progress =
    totalOpening > 0 ? Math.min(100, Math.round((totalPaid / totalOpening) * 100)) : 0

  return (
    <main className="px-4 py-6 text-gray-900">
      <h1 className="mb-4 text-2xl font-semibold">Deudas</h1>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
          No tienes deudas registradas.
        </p>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Saldo total</p>
            <p className="text-3xl font-semibold tabular-nums">{formatCOP(totalBalance)}</p>
            <p className="mt-1 text-sm text-gray-600">
              Abonado {formatCOP(totalPaid)} de {formatCOP(totalOpening)}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-900"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map(({ debt, balance, paid }) => {
              const settled = balance <= 0
              return (
                <li key={debt.id}>
                  <button
                    type="button"
                    onClick={() => setScreen({ name: 'detail', debtId: debt.id })}
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 break-words font-medium">{debt.name}</span>
                      {settled ? (
                        <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          ✓ Saldada
                        </span>
                      ) : (
                        <DebtStatusChip status={debt.status} />
                      )}
                    </div>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {formatCOP(Math.max(0, balance))}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      Abonado {formatCOP(paid)}
                      {debt.monthlyPayment > 0 && ` · cuota ${formatCOP(debt.monthlyPayment)}`}
                    </p>
                    {debt.annualRate != null && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatRate(debt.annualRate)} % E.A.
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={() => setScreen({ name: 'new' })}
        className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white"
      >
        + Nueva deuda
      </button>
    </main>
  )
}
