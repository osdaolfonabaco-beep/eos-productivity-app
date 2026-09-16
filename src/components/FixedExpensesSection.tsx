import { useState, type FormEvent } from 'react'
import type { FixedExpense, FixedExpenseInput, Quincena } from '../data'
import { parsePesos } from '../money'
import FixedExpenseRow, { QuincenaPicker } from './FixedExpenseRow'

interface FixedExpensesSectionProps {
  expenses: FixedExpense[]
  /**
   * La quincena visitada (no siempre la de hoy: se puede navegar), para
   * atenuar los gastos que no le aplican. Los gastos en sí no son
   * históricos — son siempre los actuales, solo cambia cuáles se atenúan.
   */
  periodLabel: 'primera' | 'segunda'
  busy: boolean
  onCreate: (input: FixedExpenseInput) => void
  onUpdate: (id: string, input: FixedExpenseInput) => void
  onArchive: (id: string) => void
}

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

/**
 * Bloque 2 de la vista Sueldo: la lista de gastos fijos, con edición en línea
 * y archivar de dos toques por fila (`FixedExpenseRow`). El alta no está
 * siempre abierta: se repliega en una fila "+ Añadir gasto fijo" que
 * despliega el formulario, mismo patrón que "+ Añadir hábito" en Hábitos.
 */
export default function FixedExpensesSection({
  expenses,
  periodLabel,
  busy,
  onCreate,
  onUpdate,
  onArchive,
}: FixedExpensesSectionProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [quincena, setQuincena] = useState<Quincena>('ambas')

  const amountValue = parsePesos(amount)
  const canAdd = name.trim().length > 0 && amountValue !== null && amountValue > 0 && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canAdd || amountValue === null) return
    onCreate({ name: name.trim(), amount: amountValue, quincena })
    cancelForm()
  }

  function cancelForm() {
    setName('')
    setAmount('')
    setQuincena('ambas')
    setFormOpen(false)
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Gastos fijos</h2>

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        {expenses.length === 0 && (
          <p className="flex min-h-11 items-center border-b-[0.5px] border-separador px-3 text-texto-tenue">
            No tienes gastos fijos. Añade el primero abajo.
          </p>
        )}

        {expenses.length > 0 && (
          <ul>
            {expenses.map((expense, i) => (
              <li
                key={expense.id}
                className={i < expenses.length - 1 ? 'border-b-[0.5px] border-separador' : ''}
              >
                <FixedExpenseRow
                  expense={expense}
                  periodLabel={periodLabel}
                  busy={busy}
                  onUpdate={(input) => onUpdate(expense.id, input)}
                  onArchive={() => onArchive(expense.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {formOpen ? (
          <form onSubmit={submit} className="flex flex-col gap-2 px-3 py-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del gasto…"
              aria-label="Nombre del gasto fijo"
              autoFocus
              disabled={busy}
              className={campoClass}
            />
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$ 0"
              aria-label="Monto del gasto fijo"
              disabled={busy}
              className={campoClass}
            />
            <QuincenaPicker value={quincena} onChange={setQuincena} disabled={busy} />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canAdd}
                className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
          >
            <span aria-hidden="true">+</span>
            <span>Añadir gasto fijo</span>
          </button>
        )}
      </div>
    </section>
  )
}
