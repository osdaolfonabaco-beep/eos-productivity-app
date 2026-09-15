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

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

/**
 * Selector de quincena de tres botones (en vez de un `<select>`, para que se
 * lea y se toque igual que el resto de elecciones de la app, p. ej. el
 * estado de una deuda). Se usa tanto al crear como al editar un gasto fijo.
 * El botón elegido pasa a `--color-acento` con `--sombra-acento`; los otros
 * quedan neutros con borde.
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
            className={`flex-1 rounded-campo px-2 py-2 text-xs font-medium transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-60 ${
              active
                ? 'bg-acento text-white shadow-[var(--sombra-acento)] active:bg-[var(--color-acento-toque)]'
                : 'border border-borde text-texto-apagado active:bg-separador'
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
  /** La quincena visitada, para atenuar los gastos que no le aplican. */
  periodLabel: 'primera' | 'segunda'
  busy: boolean
  onUpdate: (input: FixedExpenseInput) => void
  onArchive: () => void
}

type Mode = 'view' | 'edit' | 'confirm-archive'

/**
 * Una fila de "Gastos fijos": ver (atenuada si no aplica a la quincena
 * visitada, con menú "⋯" para Editar/Eliminar), editar en línea y archivar
 * con confirmación de dos toques — mismo patrón que `HabitManageRow`. Vive
 * dentro de la tarjeta única de `FixedExpensesSection`, no trae su propio
 * borde: la fila de arriba lo separa con una línea de 0.5px.
 */
export default function FixedExpenseRow({
  expense,
  periodLabel,
  busy,
  onUpdate,
  onArchive,
}: FixedExpenseRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [menuOpen, setMenuOpen] = useState(false)
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
      <div className="px-3 py-3">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Nombre del gasto"
            disabled={busy}
            className={campoClass}
          />
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="$ 0"
            aria-label="Monto del gasto"
            disabled={busy}
            className={campoClass}
          />
          <QuincenaPicker value={quincena} onChange={setQuincena} disabled={busy} />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canSave || busy}
            className="rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-archive') {
    return (
      <div className="px-3 py-3">
        <p className="break-words text-contenido font-medium text-texto">{expense.name}</p>
        <p className="mt-1 text-sm text-texto-apagado">Se archivará. El historial se conserva.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={busy}
            className="rounded-campo bg-fallado px-4 py-3 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  const applies = appliesToQuincena(expense, periodLabel)
  const cadence = fixedExpenseCadence(expense)
  const whenLabel =
    cadence === 'quincenal'
      ? 'Quincenal'
      : `Mensual, ${expense.quincena === 'primera' ? 'primera quincena' : 'segunda quincena'}`

  return (
    <div className={applies ? '' : 'opacity-50'}>
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-contenido font-medium text-texto">{expense.name}</p>
          <p className="text-sm tabular-nums text-texto-apagado">
            {formatCOP(expense.amount)} · {whenLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={`Más acciones para ${expense.name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div className="flex gap-4 px-3 pb-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              startEdit()
            }}
            className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setMode('confirm-archive')
            }}
            className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  )
}
