import { useState, type FormEvent } from 'react'
import type { Debt, DebtInput, DebtStatus } from '../data'
import { formatCOP, formatRate, parsePesos, parseRate } from '../money'

interface DebtFormProps {
  /** Deuda a editar; ausente para una nueva. */
  initial?: Debt
  onSubmit: (values: DebtInput) => void
  onCancel: () => void
}

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800'

function StatusButton({
  current,
  value,
  label,
  onSelect,
}: {
  current: DebtStatus
  value: DebtStatus
  label: string
  onSelect: (v: DebtStatus) => void
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium ${
        active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Formulario de deuda, para crear y para editar. Presentacional: reúne los
 * valores y los entrega con `onSubmit`; no conoce el módulo de datos.
 */
export default function DebtForm({ initial, onSubmit, onCancel }: DebtFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [balance, setBalance] = useState(initial ? String(initial.openingBalance) : '')
  const [quota, setQuota] = useState(
    initial && initial.monthlyPayment > 0 ? String(initial.monthlyPayment) : '',
  )
  const [rate, setRate] = useState(
    initial?.annualRate != null ? formatRate(initial.annualRate) : '',
  )
  const [status, setStatus] = useState<DebtStatus>(initial?.status ?? 'al-dia')

  const openingBalance = parsePesos(balance)
  const canSave = name.trim().length > 0 && openingBalance !== null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || openingBalance === null) return
    onSubmit({
      name: name.trim(),
      openingBalance,
      annualRate: parseRate(rate),
      monthlyPayment: parsePesos(quota) ?? 0,
      status,
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">Nombre</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">
          {initial ? 'Saldo actual (corrección)' : 'Saldo actual'}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="$ 0"
          className={inputClass}
        />
        {openingBalance !== null && (
          <span className="text-xs text-gray-500">{formatCOP(openingBalance)}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">Cuota mensual</span>
        <input
          type="text"
          inputMode="numeric"
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
          placeholder="$ 0"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">Tasa anual (opcional)</span>
        <span className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0"
            className={`${inputClass} flex-1`}
          />
          <span className="text-sm text-gray-500">% E.A.</span>
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">Estado</span>
        <div className="flex gap-2">
          <StatusButton current={status} value="al-dia" label="Al día" onSelect={setStatus} />
          <StatusButton current={status} value="en-mora" label="En mora" onSelect={setStatus} />
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
