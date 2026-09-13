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

/**
 * Bloque 2 de la vista Sueldo: alta rápida de gastos fijos y la lista, con
 * edición en línea y archivar de dos toques por fila (`FixedExpenseRow`).
 */
export default function FixedExpensesSection({
  expenses,
  periodLabel,
  busy,
  onCreate,
  onUpdate,
  onArchive,
}: FixedExpensesSectionProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [quincena, setQuincena] = useState<Quincena>('ambas')

  const amountValue = parsePesos(amount)
  const canAdd = name.trim().length > 0 && amountValue !== null && amountValue > 0 && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canAdd || amountValue === null) return
    onCreate({ name: name.trim(), amount: amountValue, quincena })
    setName('')
    setAmount('')
    setQuincena('ambas')
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Gastos fijos</h2>

      <form
        onSubmit={submit}
        className="mb-4 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del gasto…"
          aria-label="Nombre del gasto fijo"
          disabled={busy}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
        />
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$ 0"
          aria-label="Monto del gasto fijo"
          disabled={busy}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
        />
        <QuincenaPicker value={quincena} onChange={setQuincena} disabled={busy} />
        <button
          type="submit"
          disabled={!canAdd}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Añadir
        </button>
      </form>

      {expenses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
          No tienes gastos fijos. Añade el primero arriba.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {expenses.map((expense) => (
            <li key={expense.id}>
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
    </section>
  )
}
