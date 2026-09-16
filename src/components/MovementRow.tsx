import { useState } from 'react'
import { isISODate, type Expense, type ExpenseInput, type Income, type IncomeInput } from '../data'
import { formatCOP, parsePesos } from '../money'
import ExpenseForm from './ExpenseForm'

/** Un ingreso o un gasto real, listos para entrar en la lista cronológica única. */
export type MovementItem = { kind: 'income'; income: Income } | { kind: 'expense'; expense: Expense }

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

interface MovementRowProps {
  item: MovementItem
  /** Id del `<datalist>` de categorías de ingreso, para cuando `item.kind === 'income'`. */
  incomeCategoryListId: string
  /** Id del `<datalist>` de categorías de gasto, para cuando `item.kind === 'expense'`. */
  expenseCategoryListId: string
  minDate: string
  maxDate: string
  busy: boolean
  onUpdateIncome: (id: string, input: IncomeInput) => void
  onUpdateExpense: (id: string, input: ExpenseInput) => void
  onArchiveIncome: (id: string) => void
  onArchiveExpense: (id: string) => void
}

type Mode = 'view' | 'edit' | 'confirm-archive'

/** `2026-09-09` → `09 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * Una fila de la lista cronológica de Movimientos: puede ser un ingreso o un
 * gasto real, distinguidos por `item.kind`. Ver (franja izquierda
 * transparente, monto en verde con "+" para un ingreso o en rojo con "−"
 * para un gasto), editar en línea y archivar con confirmación de dos
 * toques — mismo patrón que ya usaba `IncomeRow`.
 *
 * La edición de un ingreso reutiliza los mismos campos en línea que ya
 * tenía `IncomeRow` (sin extraerlos: solo hay dos usos, alta y edición,
 * igual que antes). La edición de un gasto reutiliza `ExpenseForm`, que sí
 * se extrajo porque tiene tres usos (esta edición, el alta suelta y la fila
 * de "Marcar pagado").
 */
export default function MovementRow({
  item,
  incomeCategoryListId,
  expenseCategoryListId,
  minDate,
  maxDate,
  busy,
  onUpdateIncome,
  onUpdateExpense,
  onArchiveIncome,
  onArchiveExpense,
}: MovementRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [menuOpen, setMenuOpen] = useState(false)

  // Estado del formulario de edición de un ingreso (no se usa para gastos:
  // esos editan con `ExpenseForm`, que trae su propio estado interno).
  const income = item.kind === 'income' ? item.income : null
  const [incomeDate, setIncomeDate] = useState(income?.date ?? '')
  const [incomeAmount, setIncomeAmount] = useState(income ? String(income.amount) : '')
  const [incomeCategory, setIncomeCategory] = useState(income?.category ?? '')
  const [incomeNote, setIncomeNote] = useState(income?.note ?? '')

  function startEdit() {
    if (item.kind === 'income') {
      setIncomeDate(item.income.date)
      setIncomeAmount(String(item.income.amount))
      setIncomeCategory(item.income.category ?? '')
      setIncomeNote(item.income.note ?? '')
    }
    setMode('edit')
  }

  function archive() {
    if (item.kind === 'income') onArchiveIncome(item.income.id)
    else onArchiveExpense(item.expense.id)
  }

  if (mode === 'edit' && item.kind === 'expense') {
    return (
      <ExpenseForm
        initialValues={{
          concept: item.expense.concept,
          amount: String(item.expense.amount),
          date: item.expense.date,
          category: item.expense.category ?? '',
          note: item.expense.note ?? '',
        }}
        fixedExpenseId={item.expense.fixedExpenseId}
        categoryListId={expenseCategoryListId}
        minDate={minDate}
        maxDate={maxDate}
        busy={busy}
        onSubmit={(input) => {
          onUpdateExpense(item.expense.id, input)
          setMode('view')
        }}
        onCancel={() => setMode('view')}
      />
    )
  }

  if (mode === 'edit' && item.kind === 'income') {
    const currentIncome = item.income
    const incomeAmountValue = parsePesos(incomeAmount)
    const canSave = incomeAmountValue !== null && incomeAmountValue > 0 && isISODate(incomeDate)

    function save() {
      if (!canSave || incomeAmountValue === null) return
      onUpdateIncome(currentIncome.id, {
        date: incomeDate,
        amount: incomeAmountValue,
        category: incomeCategory.trim() || null,
        note: incomeNote.trim() || null,
      })
      setMode('view')
    }

    return (
      <div className="px-3 py-3">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={incomeAmount}
            onChange={(e) => setIncomeAmount(e.target.value)}
            placeholder="$ 0"
            aria-label="Monto del ingreso"
            autoFocus
            disabled={busy}
            className={campoClass}
          />
          <input
            type="date"
            value={incomeDate}
            min={minDate}
            max={maxDate}
            onChange={(e) => setIncomeDate(e.target.value)}
            aria-label="Fecha del ingreso"
            disabled={busy}
            className={campoClass}
          />
          <input
            type="text"
            list={incomeCategoryListId}
            value={incomeCategory}
            onChange={(e) => setIncomeCategory(e.target.value)}
            placeholder="Categoría (opcional)"
            aria-label="Categoría del ingreso"
            disabled={busy}
            className={campoClass}
          />
          <input
            type="text"
            value={incomeNote}
            onChange={(e) => setIncomeNote(e.target.value)}
            placeholder="Nota (opcional)"
            aria-label="Nota del ingreso"
            disabled={busy}
            className={campoClass}
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canSave || busy}
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
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
        <p className="text-sm text-texto-apagado">Se archivará. El historial se conserva.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={archive}
            disabled={busy}
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            Archivar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  const isIncome = item.kind === 'income'
  const date = isIncome ? item.income.date : item.expense.date
  const category = isIncome ? item.income.category : item.expense.category
  const amount = isIncome ? item.income.amount : item.expense.amount
  const concept = isIncome ? item.income.note || item.income.category || 'Ingreso' : item.expense.concept
  // Para un ingreso sin nota, el concepto YA es la categoría — repetirla en
  // la meta no diría nada nuevo. Un gasto no tiene ese problema: su
  // concepto es un campo aparte, así que la categoría siempre suma.
  const showCategoryInMeta = isIncome
    ? Boolean(item.income.category) && Boolean(item.income.note)
    : Boolean(category)

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2 border-l-[3px] border-l-transparent px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-contenido font-medium text-texto">{concept}</p>
          <p className="text-meta text-texto-apagado">
            {formatShortDate(date)}
            {showCategoryInMeta && ` · ${category}`}
          </p>
        </div>
        <span
          className={`shrink-0 font-medium tabular-nums ${isIncome ? 'text-hecho' : 'text-fallado'}`}
        >
          {isIncome ? '+ ' : '− '}
          {formatCOP(amount)}
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={`Más acciones para ${concept}`}
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
            Archivar
          </button>
        </div>
      )}
    </div>
  )
}
