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
import { useMounted } from '../useMounted'
import DebtDetail from './DebtDetail'
import DebtForm from './DebtForm'
import DebtStatusChip from './DebtStatusChip'
import ProgressRing from './ProgressRing'
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

/**
 * El anillo solo cuenta al montar la pestaña Deudas, no en cada
 * recarga de datos (ej. al volver del detalle tras registrar un pago) —
 * mismo criterio que `WeekProgressRing` con `weekKey`.
 */
const RING_KEY = 'deudas'

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
    <main className="px-4 py-6 text-texto">
      <button
        type="button"
        onClick={onCancel}
        className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
      >
        ‹ Deudas
      </button>
      <h1 className="mb-4 mt-3 text-titulo">{title}</h1>
      {error && <ActionError message={error} onDismiss={onDismissError} />}
      <fieldset disabled={busy} className="disabled:opacity-60">
        <DebtForm initial={initial} onSubmit={onSubmit} onCancel={onCancel} />
      </fieldset>
    </main>
  )
}

/**
 * Una tarjeta de deuda: nombre y estado, saldo, abonado y cuota, la barra de
 * abonado (crece al montar, con `index * 60ms` de desfase respecto a la
 * anterior — misma técnica que la barra de la meta de ahorro) y la tasa.
 */
function DebtCard({
  debt,
  balance,
  paid,
  index,
  onSelect,
}: {
  debt: Debt
  balance: number
  paid: number
  index: number
  onSelect: () => void
}) {
  const mounted = useMounted()
  const settled = balance <= 0
  const progressPct =
    debt.openingBalance > 0 ? Math.min(100, Math.round((paid / debt.openingBalance) * 100)) : 0

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-tarjeta border border-borde bg-tarjeta p-4 text-left shadow-[var(--sombra-tarjeta)] transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.985]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-words font-medium text-texto">{debt.name}</span>
          {settled ? (
            <span className="shrink-0 rounded-pastilla bg-hecho-suave px-2 py-0.5 text-xs font-medium text-hecho">
              ✓ Saldada
            </span>
          ) : (
            <DebtStatusChip status={debt.status} />
          )}
        </div>
        <p className="mt-1 text-xl font-semibold tabular-nums text-texto">
          {formatCOP(Math.max(0, balance))}
        </p>
        <p className="mt-1 text-sm tabular-nums text-texto-apagado">
          Abonado {formatCOP(paid)}
          {debt.monthlyPayment > 0 && ` · cuota ${formatCOP(debt.monthlyPayment)}`}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-separador">
          <div
            className="h-full origin-left rounded-full bg-[image:var(--grad-ind-acento)]"
            style={{
              transform: mounted ? 'scaleX(1)' : 'scaleX(0)',
              width: `${progressPct}%`,
              transitionProperty: 'transform',
              transitionDuration: 'var(--dur-entrada)',
              transitionTimingFunction: 'var(--ease-salida)',
              transitionDelay: `${index * 60}ms`,
            }}
          />
        </div>
        {debt.annualRate != null && (
          <p className="mt-1.5 text-xs tabular-nums text-texto-tenue">{formatRate(debt.annualRate)} % E.A.</p>
        )}
      </button>
    </li>
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
  // Sin abonos, repetir "$0 de $X" no dice nada nuevo — a diferencia de un
  // 0% de Semana (dura un día), este 0% puede durar meses, así que el texto
  // da el siguiente paso en vez de otro cero.
  const abonadoCaption =
    totalPaid > 0
      ? `Abonado ${formatCOP(totalPaid)} de ${formatCOP(totalOpening)}`
      : 'Sin abonos registrados todavía'

  return (
    <main className="px-4 py-6 text-texto">
      <h1 className="mb-4 text-titulo">Deudas</h1>

      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {rows.length === 0 ? (
        <p className="rounded-tarjeta border border-dashed border-borde px-4 py-8 text-center text-texto-apagado">
          No tienes deudas registradas.
        </p>
      ) : (
        <>
          <ProgressRing
            animKey={RING_KEY}
            pct={progress}
            ariaLabel={`${progress}% abonado del total de deudas, ${abonadoCaption.toLowerCase()}`}
            caption={abonadoCaption}
          />
          <p className="mb-4 mt-3 text-center text-sm text-texto-apagado">
            Saldo total{' '}
            <span className="font-semibold tabular-nums text-texto">{formatCOP(totalBalance)}</span>
          </p>

          <ul className="flex flex-col gap-3">
            {rows.map(({ debt, balance, paid }, i) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                balance={balance}
                paid={paid}
                index={i}
                onSelect={() => setScreen({ name: 'detail', debtId: debt.id })}
              />
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={() => setScreen({ name: 'new' })}
        className="mt-6 w-full rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-[var(--color-texto-toque)]"
      >
        + Nueva deuda
      </button>
    </main>
  )
}
