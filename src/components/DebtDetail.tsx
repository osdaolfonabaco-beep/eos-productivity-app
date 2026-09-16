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

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento'

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
      <main className="px-4 py-6 text-texto">
        <button
          type="button"
          onClick={onBack}
          className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
        >
          ‹ Deudas
        </button>
        <p className="mt-6 text-texto-apagado">Esta deuda ya no está disponible.</p>
      </main>
    )
  }

  const paid = sumPayments(payments)
  const rawBalance = debtBalance(debt, payments)
  const settled = rawBalance <= 0
  const balance = Math.max(0, rawBalance)
  const progress =
    debt.openingBalance > 0 ? Math.min(100, Math.round((paid / debt.openingBalance) * 100)) : 0

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
    <main className="px-4 py-6 text-texto">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
        >
          ‹ Deudas
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-campo border border-borde px-3 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
        >
          Editar
        </button>
      </div>

      <h1 className="mt-3 text-titulo">{debt.name}</h1>

      {actionError && (
        <div className="mt-4">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <div className="mt-4 rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums text-texto">{formatCOP(balance)}</span>
          {settled ? (
            <span className="shrink-0 rounded-pastilla bg-hecho-suave px-2 py-0.5 text-xs font-medium text-hecho">
              ✓ Saldada
            </span>
          ) : (
            <DebtStatusChip status={debt.status} />
          )}
        </div>
        <p className="mt-1 text-sm tabular-nums text-texto-apagado">
          Abonado {formatCOP(paid)} de {formatCOP(debt.openingBalance)}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-separador">
          <div
            className="h-full rounded-full bg-[image:var(--grad-ind-acento)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-sm tabular-nums text-texto-apagado">
          Cuota mensual {formatCOP(debt.monthlyPayment)}
          {debt.annualRate != null && ` · ${formatRate(debt.annualRate)} % E.A.`}
        </p>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Registrar pago</h2>
        <form onSubmit={submitPayment} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-texto-apagado">Fecha</span>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={campoClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-texto-apagado">Monto</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$ 0"
              className={`w-full ${campoClass}`}
            />
          </label>
          <button
            type="submit"
            disabled={!canRegister}
            className="rounded-campo bg-texto px-4 py-2 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Pagos</h2>
        {payments.length === 0 ? (
          <p className="rounded-tarjeta border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-apagado">
            Aún no has registrado pagos.
          </p>
        ) : (
          <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
            <ul>
              {payments.map((p, i) => (
                <li key={p.id} className={i < payments.length - 1 ? 'border-b-[0.5px] border-separador' : ''}>
                  {confirmingPaymentId === p.id ? (
                    <div className="px-3 py-3">
                      <p className="text-sm text-texto-cuerpo">
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
                          className="rounded-campo bg-fallado px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
                        >
                          Borrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingPaymentId(null)}
                          className="rounded-campo border border-borde px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm text-texto-apagado">{formatDate(p.date)}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-medium tabular-nums text-texto">{formatCOP(p.amount)}</span>
                        <button
                          type="button"
                          onClick={() => setConfirmingPaymentId(p.id)}
                          className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
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
          </div>
        )}
      </section>

      <section className="mt-8">
        {confirmingArchive ? (
          <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
            <p className="text-sm text-texto-apagado">Se archivará. El historial de pagos se conserva.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => archiveDebt(debtId), 'No se pudo archivar.', onBack)
                }
                className="rounded-campo bg-fallado px-4 py-3 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
              >
                Archivar deuda
              </button>
              <button
                type="button"
                onClick={() => setConfirmingArchive(false)}
                className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingArchive(true)}
            className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Archivar deuda
          </button>
        )}
      </section>
    </main>
  )
}
