import { useState } from 'react'
import type { ExpenseInput, FixedExpense } from '../data'
import { formatCOP } from '../money'
import ExpenseForm from './ExpenseForm'

interface PendingFixedExpenseRowProps {
  /** La plantilla de gasto fijo todavía sin pagar en esta quincena. */
  expense: FixedExpense
  categoryListId: string
  minDate: string
  maxDate: string
  busy: boolean
  onCreateExpense: (input: ExpenseInput) => void
}

/**
 * Una fila de "Gastos fijos pendientes": atenuada (gris apagado, no es un
 * gasto real todavía), con un botón "Marcar pagado" que despliega
 * `ExpenseForm` prellenado con el monto y el nombre de la plantilla y la
 * fecha máxima disponible (hoy, o el final de la quincena si se está viendo
 * una quincena pasada). El usuario ajusta el monto si difiere y guarda; eso
 * crea un gasto real con `fixedExpenseId` apuntando a esta plantilla, con lo
 * que esta fila deja de aparecer aquí (la quincena ya tiene un gasto real
 * para esta plantilla) y el gasto aparece en la lista de movimientos.
 */
export default function PendingFixedExpenseRow({
  expense,
  categoryListId,
  minDate,
  maxDate,
  busy,
  onCreateExpense,
}: PendingFixedExpenseRowProps) {
  const [formOpen, setFormOpen] = useState(false)

  if (formOpen) {
    return (
      <ExpenseForm
        initialValues={{
          concept: expense.name,
          amount: String(expense.amount),
          date: maxDate,
          category: '',
          note: '',
        }}
        fixedExpenseId={expense.id}
        categoryListId={categoryListId}
        minDate={minDate}
        maxDate={maxDate}
        busy={busy}
        onSubmit={(input) => {
          onCreateExpense(input)
          setFormOpen(false)
        }}
        onCancel={() => setFormOpen(false)}
      />
    )
  }

  return (
    <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-texto-apagado">
      <div className="min-w-0 flex-1">
        <p className="break-words text-contenido font-medium">{expense.name}</p>
        <span className="tabular-nums text-meta">{formatCOP(expense.amount)}</span>
      </div>
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        disabled={busy}
        className="shrink-0 rounded-campo border border-borde px-3 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador disabled:opacity-40"
      >
        Marcar pagado
      </button>
    </div>
  )
}
