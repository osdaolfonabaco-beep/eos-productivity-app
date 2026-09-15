import { useState, type FormEvent } from 'react'
import { isISODate, type Income, type IncomeInput, type SalaryPeriod } from '../data'
import { formatCOP, parsePesos } from '../money'
import IncomeRow from './IncomeRow'

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

const CATEGORY_LIST_ID = 'income-category-suggestions'

interface IncomeListSectionProps {
  /** El sueldo de la quincena visitada, o `undefined` si no se ha registrado. */
  salary: SalaryPeriod | undefined
  incomes: Income[]
  /** Categorías ya usadas antes, para sugerir sin imponer una lista cerrada. */
  categorySuggestions: string[]
  minDate: string
  maxDate: string
  busy: boolean
  onCreate: (input: IncomeInput) => void
  onUpdate: (id: string, input: IncomeInput) => void
  onArchive: (id: string) => void
}

/**
 * Fila sintética del sueldo: calculada al leer, nunca guardada en `incomes`
 * (ver el comentario en `getPeriodBreakdown`). Franja `--color-acento` y
 * lavado suave para distinguirla de un ingreso real, marcada "Automático" y
 * sin menú "⋯" — no se edita desde aquí, se corrige en Sueldo.
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

/**
 * Bloque "Ingresos de la quincena": tarjeta única con filas — la del sueldo
 * (si hay uno registrado; si no, no se muestra ninguna fila de "Sueldo $0",
 * sería ruido) primero, luego los ingresos reales, y al final el alta
 * replegada en "+ Anotar un ingreso…", mismo patrón que "+ Añadir gasto
 * fijo" en Sueldo.
 */
export default function IncomeListSection({
  salary,
  incomes,
  categorySuggestions,
  minDate,
  maxDate,
  busy,
  onCreate,
  onUpdate,
  onArchive,
}: IncomeListSectionProps) {
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

  const hasRows = Boolean(salary) || incomes.length > 0

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Ingresos de la quincena</h2>

      <datalist id={CATEGORY_LIST_ID}>
        {categorySuggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        {!hasRows && (
          <p className="flex min-h-11 items-center border-b-[0.5px] border-separador px-3 text-texto-tenue">
            No tienes ingresos anotados en esta quincena.
          </p>
        )}

        {salary && (
          <div className="border-b-[0.5px] border-separador">
            <SyntheticSalaryRow amount={salary.amount} />
          </div>
        )}

        {incomes.length > 0 && (
          <ul>
            {incomes.map((income, i) => (
              <li key={income.id} className={i < incomes.length - 1 ? 'border-b-[0.5px] border-separador' : ''}>
                <IncomeRow
                  income={income}
                  categoryListId={CATEGORY_LIST_ID}
                  minDate={minDate}
                  maxDate={maxDate}
                  busy={busy}
                  onUpdate={(input) => onUpdate(income.id, input)}
                  onArchive={() => onArchive(income.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {formOpen ? (
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
              list={CATEGORY_LIST_ID}
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
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
          >
            <span aria-hidden="true">+</span>
            <span>Anotar un ingreso…</span>
          </button>
        )}
      </div>
    </section>
  )
}
