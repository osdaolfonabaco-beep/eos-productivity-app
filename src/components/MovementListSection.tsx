import { useState, type FormEvent } from 'react'
import {
  isISODate,
  type Expense,
  type ExpenseInput,
  type FixedExpense,
  type Income,
  type IncomeInput,
  type SalaryPeriod,
} from '../data'
import { formatCOP, parsePesos } from '../money'
import ExpenseForm from './ExpenseForm'
import MovementRow, { type MovementItem } from './MovementRow'
import PendingFixedExpenseRow from './PendingFixedExpenseRow'

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

const INCOME_CATEGORY_LIST_ID = 'movement-income-category-suggestions'
const EXPENSE_CATEGORY_LIST_ID = 'movement-expense-category-suggestions'

interface MovementListSectionProps {
  /** El sueldo de la quincena visitada, o `undefined` si no se ha registrado. */
  salary: SalaryPeriod | undefined
  incomes: Income[]
  expenses: Expense[]
  /** Plantillas de gastos fijos de esta quincena sin un gasto real todavía. */
  pendingFixedExpenses: FixedExpense[]
  incomeCategorySuggestions: string[]
  expenseCategorySuggestions: string[]
  minDate: string
  maxDate: string
  busy: boolean
  onCreateIncome: (input: IncomeInput) => void
  onUpdateIncome: (id: string, input: IncomeInput) => void
  onArchiveIncome: (id: string) => void
  onCreateExpense: (input: ExpenseInput) => void
  onUpdateExpense: (id: string, input: ExpenseInput) => void
  onArchiveExpense: (id: string) => void
}

/**
 * Fila sintética del sueldo: calculada al leer, nunca guardada en `incomes`
 * (ver el comentario en `getPeriodBreakdown`). Franja `--color-acento` y
 * lavado suave para distinguirla de un movimiento real, marcada
 * "Automático" y sin menú "⋯" — no se edita desde aquí, se corrige en
 * Sueldo. Va siempre primera, fuera del orden cronológico: no tiene una
 * fecha exacta dentro de la quincena con la que intercalarla.
 */
function SyntheticSalaryRow({ amount }: { amount: number }) {
  return (
    <div
      className="flex min-h-11 items-center gap-2 border-l-[3px] border-l-acento px-3 py-2"
      style={{ backgroundColor: 'var(--color-acento-suave)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-contenido font-medium text-texto">Sueldo</p>
        <p className="text-meta text-texto-apagado">Automático</p>
      </div>
      <span className="shrink-0 font-medium tabular-nums text-texto">{formatCOP(amount)}</span>
    </div>
  )
}

/** Ingresos y gastos mezclados en una sola lista, de la fecha más reciente a la más antigua. */
function buildMovementItems(incomes: Income[], expenses: Expense[]): MovementItem[] {
  const items: MovementItem[] = [
    ...incomes.map((income): MovementItem => ({ kind: 'income', income })),
    ...expenses.map((expense): MovementItem => ({ kind: 'expense', expense })),
  ]
  return items.sort((a, b) => {
    const dateA = a.kind === 'income' ? a.income.date : a.expense.date
    const dateB = b.kind === 'income' ? b.income.date : b.expense.date
    return dateB.localeCompare(dateA)
  })
}

/**
 * El alta replegada "+ Anotar un ingreso…": mismos campos que ya tenía
 * `IncomeListSection`, sin extraerlos aparte — solo hay dos usos de este
 * formulario (este alta y la edición en `MovementRow`), igual que antes de
 * fusionar Ingresos y Gastos.
 */
function AddIncomeToggle({
  categoryListId,
  minDate,
  maxDate,
  busy,
  onCreate,
}: {
  categoryListId: string
  minDate: string
  maxDate: string
  busy: boolean
  onCreate: (input: IncomeInput) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState(maxDate)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')

  const amountValue = parsePesos(amount)
  const canAdd = amountValue !== null && amountValue > 0 && isISODate(date) && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canAdd || amountValue === null) return
    onCreate({ date, amount: amountValue, category: category.trim() || null, note: note.trim() || null })
    cancelForm()
  }

  function cancelForm() {
    setDate(maxDate)
    setAmount('')
    setCategory('')
    setNote('')
    setFormOpen(false)
  }

  if (!formOpen) {
    return (
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
      >
        <span aria-hidden="true">+</span>
        <span>Anotar un ingreso…</span>
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 px-3 py-3">
      <input
        type="text"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="$ 0"
        aria-label="Monto del ingreso"
        autoFocus
        disabled={busy}
        className={campoClass}
      />
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Fecha del ingreso"
        disabled={busy}
        className={campoClass}
      />
      <input
        type="text"
        list={categoryListId}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Categoría (opcional)"
        aria-label="Categoría del ingreso"
        disabled={busy}
        className={campoClass}
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (opcional)"
        aria-label="Nota del ingreso"
        disabled={busy}
        className={campoClass}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canAdd}
          className="rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={cancelForm}
          className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

/** El alta replegada "+ Anotar un gasto…": usa `ExpenseForm`, sin plantilla asociada. */
function AddExpenseToggle({
  categoryListId,
  minDate,
  maxDate,
  busy,
  onCreate,
}: {
  categoryListId: string
  minDate: string
  maxDate: string
  busy: boolean
  onCreate: (input: ExpenseInput) => void
}) {
  const [formOpen, setFormOpen] = useState(false)

  if (!formOpen) {
    return (
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
      >
        <span aria-hidden="true">+</span>
        <span>Anotar un gasto…</span>
      </button>
    )
  }

  return (
    <ExpenseForm
      fixedExpenseId={null}
      categoryListId={categoryListId}
      minDate={minDate}
      maxDate={maxDate}
      busy={busy}
      onSubmit={(input) => {
        onCreate(input)
        setFormOpen(false)
      }}
      onCancel={() => setFormOpen(false)}
    />
  )
}

/**
 * Bloque "Movimientos de la quincena": las plantillas de gastos fijos aún
 * sin pagar (si hay alguna), la tarjeta única con la fila del sueldo (si
 * hay uno registrado) seguida de todos los ingresos y gastos reales en una
 * sola lista cronológica, y al final las dos altas replegadas.
 */
export default function MovementListSection({
  salary,
  incomes,
  expenses,
  pendingFixedExpenses,
  incomeCategorySuggestions,
  expenseCategorySuggestions,
  minDate,
  maxDate,
  busy,
  onCreateIncome,
  onUpdateIncome,
  onArchiveIncome,
  onCreateExpense,
  onUpdateExpense,
  onArchiveExpense,
}: MovementListSectionProps) {
  const items = buildMovementItems(incomes, expenses)
  const hasRows = Boolean(salary) || items.length > 0

  return (
    <>
      <datalist id={INCOME_CATEGORY_LIST_ID}>
        {incomeCategorySuggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={EXPENSE_CATEGORY_LIST_ID}>
        {expenseCategorySuggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {pendingFixedExpenses.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Gastos fijos pendientes</h2>
          <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
            <ul>
              {pendingFixedExpenses.map((expense, i) => (
                <li
                  key={expense.id}
                  className={i < pendingFixedExpenses.length - 1 ? 'border-b-[0.5px] border-separador' : ''}
                >
                  <PendingFixedExpenseRow
                    expense={expense}
                    categoryListId={EXPENSE_CATEGORY_LIST_ID}
                    minDate={minDate}
                    maxDate={maxDate}
                    busy={busy}
                    onCreateExpense={onCreateExpense}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Movimientos de la quincena</h2>

        <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
          {!hasRows && (
            <p className="flex min-h-11 items-center border-b-[0.5px] border-separador px-3 text-texto-tenue">
              No tienes movimientos anotados en esta quincena.
            </p>
          )}

          {salary && (
            <div className="border-b-[0.5px] border-separador">
              <SyntheticSalaryRow amount={salary.amount} />
            </div>
          )}

          {items.length > 0 && (
            <ul>
              {items.map((item, i) => (
                <li
                  key={item.kind === 'income' ? `income-${item.income.id}` : `expense-${item.expense.id}`}
                  className={i < items.length - 1 ? 'border-b-[0.5px] border-separador' : ''}
                >
                  <MovementRow
                    item={item}
                    incomeCategoryListId={INCOME_CATEGORY_LIST_ID}
                    expenseCategoryListId={EXPENSE_CATEGORY_LIST_ID}
                    minDate={minDate}
                    maxDate={maxDate}
                    busy={busy}
                    onUpdateIncome={onUpdateIncome}
                    onUpdateExpense={onUpdateExpense}
                    onArchiveIncome={onArchiveIncome}
                    onArchiveExpense={onArchiveExpense}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="border-t-[0.5px] border-separador">
            <AddIncomeToggle
              categoryListId={INCOME_CATEGORY_LIST_ID}
              minDate={minDate}
              maxDate={maxDate}
              busy={busy}
              onCreate={onCreateIncome}
            />
          </div>
          <div className="border-t-[0.5px] border-separador">
            <AddExpenseToggle
              categoryListId={EXPENSE_CATEGORY_LIST_ID}
              minDate={minDate}
              maxDate={maxDate}
              busy={busy}
              onCreate={onCreateExpense}
            />
          </div>
        </div>
      </section>
    </>
  )
}
