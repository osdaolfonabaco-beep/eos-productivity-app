import { useCallback, useState, type FormEvent } from 'react'
import {
  addPayment,
  archiveDebt,
  debtBalance,
  deletePayment,
  getDebt,
  getPayments,
  isISODate,
  sumPayments,
  todayISO,
  type Debt,
  type Payment,
} from '../data'
import { formatCOP, formatRate, parsePesos } from '../money'
import { useAsyncData } from '../useAsyncData'
import DebtStatusChip from './DebtStatusChip'
import { ActionError, LoadError, Loading } from './ViewState'

interface DebtDetailProps {
  debtId: string
  onBack: () => void
  onEdit: () => void
}

/** `2026-09-09` → `09 sept 2026`. Solo para mostrar. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

interface DetailData {
  debt: Debt | undefined
  payments: Payment[]
}

export default function DebtDetail({ debtId, onBack, onEdit }: DebtDetailProps) {
  const fetcher = useCallback(async (): Promise<DetailData> => {
    const [debt, payments] = await Promise.all([getDebt(debtId), getPayments(debtId)])
    return { debt, payments }
  }, [debtId])

  const { data, loading, error, reload } = useAsyncData(fetcher, [debtId])

  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, message: string, then?: () => void) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      then?.()
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

  const debt = data?.debt
  const payments = data?.payments ?? []

  if (!debt) {
    return (
      <main className="px-4 py-6 text-gray-900">
        <button type="button" onClick={onBack} className="text-sm text-gray-600">
          ‹ Deudas
        </button>
        <p className="mt-6 text-gray-500">Esta deuda ya no está disponible.</p>
      </main>
    )
  }

  const paid = sumPayments(payments)
  const rawBalance = debtBalance(debt, payments)
  const settled = rawBalance <= 0
  const balance = Math.max(0, rawBalance)
  const progress =
    debt.openingBalance > 0
      ? Math.min(100, Math.round((paid / debt.openingBalance) * 100))
      : 0

  const amountValue = parsePesos(amount)
  const canRegister = amountValue !== null && amountValue > 0 && isISODate(date) && !busy

  function submitPayment(e: FormEvent) {
    e.preventDefault()
    if (!canRegister || amountValue === null) return
    const at = date
    void run(() => addPayment(debtId, at, amountValue), 'No se pudo registrar el pago.', () => {
      setAmount('')
      setDate(todayISO())
    })
  }

  return (
    <main className="px-4 py-6 text-gray-900">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-gray-600">
          ‹ Deudas
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
        >
          Editar
        </button>
      </div>

      <h1 className="mt-3 text-2xl font-semibold">{debt.name}</h1>

      {actionError && (
        <div className="mt-4">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{formatCOP(balance)}</span>
          {settled ? (
            <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              ✓ Saldada
            </span>
          ) : (
            <DebtStatusChip status={debt.status} />
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Abonado {formatCOP(paid)} de {formatCOP(debt.openingBalance)}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-900" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Cuota mensual {formatCOP(debt.monthlyPayment)}
          {debt.annualRate != null && ` · ${formatRate(debt.annualRate)} % E.A.`}
        </p>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Registrar pago</h2>
        <form onSubmit={submitPayment} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Fecha</span>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-gray-500">Monto</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$ 0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={!canRegister}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Pagos</h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            Aún no has registrado pagos.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-3">
                {confirmingPaymentId === p.id ? (
                  <div>
                    <p className="text-sm text-gray-700">
                      ¿Borrar el pago de {formatCOP(p.amount)} del {formatDate(p.date)}?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => deletePayment(p.id),
                            'No se pudo borrar el pago.',
                            () => setConfirmingPaymentId(null),
                          )
                        }
                        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                      >
                        Borrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingPaymentId(null)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-600">{formatDate(p.date)}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium tabular-nums">{formatCOP(p.amount)}</span>
                      <button
                        type="button"
                        onClick={() => setConfirmingPaymentId(p.id)}
                        className="text-sm font-medium text-gray-500"
                        aria-label={`Borrar el pago de ${formatCOP(p.amount)} del ${formatDate(p.date)}`}
                      >
                        Borrar
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        {confirmingArchive ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
            <p className="text-sm text-gray-700">
              Se archivará. El historial de pagos se conserva.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => archiveDebt(debtId), 'No se pudo archivar.', onBack)
                }
                className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                Archivar deuda
              </button>
              <button
                type="button"
                onClick={() => setConfirmingArchive(false)}
                className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingArchive(true)}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Archivar deuda
          </button>
        )}
      </section>
    </main>
  )
}
