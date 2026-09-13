import { useState, type FormEvent } from 'react'
import {
  isISODate,
  savingsProgress,
  sumContributions,
  todayISO,
  type SavingsContribution,
  type SavingsGoal,
  type SavingsGoalInput,
} from '../data'
import { formatCOP, parsePesos } from '../money'

interface SavingsGoalSectionProps {
  /** `undefined` si no hay ninguna meta activa. */
  goal: SavingsGoal | undefined
  contributions: SavingsContribution[]
  busy: boolean
  onCreate: (input: SavingsGoalInput) => void
  onUpdate: (id: string, input: SavingsGoalInput) => void
  onArchive: (id: string) => void
  onAddContribution: (goalId: string, date: string, amount: number) => void
  onArchiveContribution: (id: string) => void
}

/** `2026-09-09` → `09 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

const fieldClass =
  'rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60'

/** El formulario de la meta: nombre, monto objetivo y fecha opcional. Sirve para crear y para editar. */
function GoalForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: SavingsGoal
  busy: boolean
  onSubmit: (input: SavingsGoalInput) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : '')
  const [date, setDate] = useState(initial?.targetDate ?? '')

  const targetAmount = parsePesos(target)
  const canSave = name.trim().length > 0 && targetAmount !== null && targetAmount > 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || targetAmount === null) return
    onSubmit({ name: name.trim(), targetAmount, targetDate: date || null })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la meta…"
        aria-label="Nombre de la meta"
        autoFocus
        disabled={busy}
        className={fieldClass}
      />
      <input
        type="text"
        inputMode="numeric"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="Monto objetivo"
        aria-label="Monto objetivo"
        disabled={busy}
        className={fieldClass}
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Fecha objetivo (opcional)</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-3 py-2 text-base disabled:opacity-60"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSave || busy}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Guardar
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Bloque 3 de la vista Sueldo: la meta de ahorro activa (una sola a la vez),
 * su progreso, el campo para anotar un aporte y los últimos aportes. Sin
 * meta, muestra el estado vacío con el formulario para crearla.
 */
export default function SavingsGoalSection({
  goal,
  contributions,
  busy,
  onCreate,
  onUpdate,
  onArchive,
  onAddContribution,
  onArchiveContribution,
}: SavingsGoalSectionProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-archive'>('view')
  const [contribDate, setContribDate] = useState(todayISO())
  const [contribAmount, setContribAmount] = useState('')
  const [confirmingContribId, setConfirmingContribId] = useState<string | null>(null)

  if (!goal) {
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Meta de ahorro</h2>
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4">
          <p className="mb-3 text-sm text-gray-500">Todavía no tienes una meta de ahorro.</p>
          <GoalForm busy={busy} onSubmit={onCreate} />
        </div>
      </section>
    )
  }

  if (mode === 'edit') {
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Meta de ahorro</h2>
        <div className="rounded-xl border border-gray-300 bg-white p-4">
          <GoalForm
            initial={goal}
            busy={busy}
            onSubmit={(input) => {
              onUpdate(goal.id, input)
              setMode('view')
            }}
            onCancel={() => setMode('view')}
          />
        </div>
      </section>
    )
  }

  const saved = sumContributions(contributions)
  const percent = Math.min(100, Math.round(savingsProgress(goal, contributions) * 100))
  const remaining = Math.max(0, goal.targetAmount - saved)

  const contribAmountValue = parsePesos(contribAmount)
  const canAddContrib =
    contribAmountValue !== null && contribAmountValue > 0 && isISODate(contribDate) && !busy

  function submitContribution(e: FormEvent) {
    e.preventDefault()
    if (!canAddContrib || contribAmountValue === null || !goal) return
    onAddContribution(goal.id, contribDate, contribAmountValue)
    setContribAmount('')
    setContribDate(todayISO())
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Meta de ahorro</h2>

      {mode === 'confirm-archive' ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
          <p className="text-sm text-gray-700">
            Se archivará: la meta y sus aportes se conservan. Podrás crear una meta nueva.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onArchive(goal.id)}
              disabled={busy}
              className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Archivar meta
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="break-words text-lg font-medium text-gray-900">{goal.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-900" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {formatCOP(saved)} de {formatCOP(goal.targetAmount)}
            {remaining > 0 && ` · faltan ${formatCOP(remaining)}`}
          </p>
          {goal.targetDate && (
            <p className="mt-0.5 text-xs text-gray-500">Meta: {formatShortDate(goal.targetDate)}</p>
          )}

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="text-sm font-medium text-gray-500"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setMode('confirm-archive')}
              className="text-sm font-medium text-gray-500"
            >
              Archivar
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-medium text-gray-700">Anotar un aporte</h3>
        <form onSubmit={submitContribution} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Fecha</span>
            <input
              type="date"
              value={contribDate}
              max={todayISO()}
              onChange={(e) => setContribDate(e.target.value)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-2 text-base disabled:opacity-60"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-gray-500">Monto</span>
            <input
              type="text"
              inputMode="numeric"
              value={contribAmount}
              onChange={(e) => setContribAmount(e.target.value)}
              placeholder="$ 0"
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={!canAddContrib}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Anotar
          </button>
        </form>
      </div>

      {contributions.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {contributions.slice(0, 5).map((c) => (
            <li key={c.id} className="rounded-xl border border-gray-200 bg-white p-3">
              {confirmingContribId === c.id ? (
                <div>
                  <p className="text-sm text-gray-700">
                    ¿Archivar el aporte de {formatCOP(c.amount)} del {formatShortDate(c.date)}?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onArchiveContribution(c.id)
                        setConfirmingContribId(null)
                      }}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Archivar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingContribId(null)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">{formatShortDate(c.date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{formatCOP(c.amount)}</span>
                    <button
                      type="button"
                      onClick={() => setConfirmingContribId(c.id)}
                      className="text-sm font-medium text-gray-500"
                      aria-label={`Archivar el aporte de ${formatCOP(c.amount)} del ${formatShortDate(c.date)}`}
                    >
                      Archivar
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
