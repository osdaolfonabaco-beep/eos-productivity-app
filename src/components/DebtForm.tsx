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
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento'

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
      className={`flex-1 rounded-campo px-4 py-3 text-sm font-medium transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] ${
        active
          ? 'bg-acento text-white shadow-[var(--sombra-acento)] active:bg-[var(--color-acento-toque)]'
          : 'border border-borde text-texto-apagado active:bg-separador'
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
        <span className="text-sm font-medium text-texto-cuerpo">Nombre</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-texto-cuerpo">
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
          <span className="text-xs tabular-nums text-texto-apagado">{formatCOP(openingBalance)}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-texto-cuerpo">Cuota mensual</span>
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
        <span className="text-sm font-medium text-texto-cuerpo">Tasa anual (opcional)</span>
        <span className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0"
            className={`${inputClass} flex-1`}
          />
          <span className="text-sm text-texto-apagado">% E.A.</span>
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-texto-cuerpo">Estado</span>
        <div className="flex gap-2">
          <StatusButton current={status} value="al-dia" label="Al día" onSelect={setStatus} />
          <StatusButton current={status} value="en-mora" label="En mora" onSelect={setStatus} />
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
