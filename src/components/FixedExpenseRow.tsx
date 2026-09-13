import { useState } from 'react'
import {
  appliesToQuincena,
  fixedExpenseCadence,
  type FixedExpense,
  type FixedExpenseInput,
  type Quincena,
} from '../data'
import { formatCOP, parsePesos } from '../money'

const QUINCENA_OPTIONS: { value: Quincena; label: string }[] = [
  { value: 'ambas', label: 'Ambas quincenas' },
  { value: 'primera', label: 'Solo la primera' },
  { value: 'segunda', label: 'Solo la segunda' },
]

/**
 * Selector de quincena de tres botones (en vez de un `<select>`, para que se
 * lea y se toque igual que el resto de elecciones de la app, p. ej. el
 * estado de una deuda). Se usa tanto al crear como al editar un gasto fijo.
 */
export function QuincenaPicker({
  value,
  onChange,
  disabled,
}: {
  value: Quincena
  onChange: (v: Quincena) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-1.5">
      {QUINCENA_OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium disabled:opacity-60 ${
              active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

interface FixedExpenseRowProps {
  expense: FixedExpense
  /** La quincena en curso, para atenuar los gastos que no le aplican. */
  currentLabel: 'primera' | 'segunda'
  busy: boolean
  onUpdate: (input: FixedExpenseInput) => void
  onArchive: () => void
}

type Mode = 'view' | 'edit' | 'confirm-archive'

/**
 * Una fila de "Gastos fijos": ver (atenuada si no aplica a la quincena en
 * curso), editar en línea y archivar con confirmación de dos toques — mismo
 * patrón que `HabitManageRow`.
 */
export default function FixedExpenseRow({
  expense,
  currentLabel,
  busy,
  onUpdate,
  onArchive,
}: FixedExpenseRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [name, setName] = useState(expense.name)
  const [amount, setAmount] = useState(String(expense.amount))
  const [quincena, setQuincena] = useState<Quincena>(expense.quincena)

  function startEdit() {
    setName(expense.name)
    setAmount(String(expense.amount))
    setQuincena(expense.quincena)
    setMode('edit')
  }

  const amountValue = parsePesos(amount)
  const canSave = name.trim().length > 0 && amountValue !== null && amountValue > 0

  function save() {
    if (!canSave || amountValue === null) return
    onUpdate({ name: name.trim(), amount: amountValue, quincena })
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Nombre del gasto"
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
          />
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="$ 0"
            aria-label="Monto del gasto"
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
          />
          <QuincenaPicker value={quincena} onChange={setQuincena} disabled={busy} />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canSave || busy}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
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
    )
  }

  if (mode === 'confirm-archive') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
        <p className="break-words text-lg font-medium text-gray-900">{expense.name}</p>
        <p className="mt-1 text-sm text-gray-600">Se archivará. El historial se conserva.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Eliminar
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
    )
  }

  const applies = appliesToQuincena(expense, currentLabel)
  const cadence = fixedExpenseCadence(expense)
  const whenLabel =
    cadence === 'quincenal'
      ? 'Quincenal'
      : `Mensual, ${expense.quincena === 'primera' ? 'primera quincena' : 'segunda quincena'}`

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 ${
        applies ? '' : 'opacity-50'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-gray-900">{expense.name}</p>
        <p className="text-sm text-gray-500">
          {formatCOP(expense.amount)} · {whenLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={startEdit}
        className="shrink-0 rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium text-gray-700"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={() => setMode('confirm-archive')}
        className="shrink-0 rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium text-gray-700"
      >
        Eliminar
      </button>
    </div>
  )
}
