import { useState, type FormEvent } from 'react'
import { isISODate, type ExpenseInput } from '../data'
import { parsePesos } from '../money'

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

export interface ExpenseFormValues {
  concept: string
  amount: string
  date: string
  category: string
  note: string
}

interface ExpenseFormProps {
  /** Valores de partida. Si falta alguno, nace vacío (fecha: `maxDate`). */
  initialValues?: Partial<ExpenseFormValues>
  /**
   * La plantilla de gasto fijo que se está pagando, o `null` si el gasto es
   * suelto. Se pasa tal cual al `ExpenseInput` final — el formulario no
   * decide esto, solo lo transporta.
   */
  fixedExpenseId: string | null
  /** Id del `<datalist>` de categorías de gasto ya usadas, montado por quien use este formulario. */
  categoryListId: string
  minDate: string
  maxDate: string
  busy: boolean
  submitLabel?: string
  onSubmit: (input: ExpenseInput) => void
  onCancel: () => void
}

/**
 * El formulario de un gasto: concepto (obligatorio), monto, fecha, categoría
 * opcional y nota — en ese orden, como pide la interfaz. Sin estado de
 * "abierto/cerrado" propio: quien lo usa lo monta solo mientras debe verse
 * (la fila pendiente al pulsar "Marcar pagado", el alta "+ Anotar un
 * gasto…", la edición en línea de un gasto), así que cada montaje nace ya
 * con los valores iniciales correctos y no hace falta resetear nada al
 * cancelar. `onSubmit` solo entrega el `ExpenseInput`; quien lo reciba
 * decide si crea o edita y cierra el formulario, igual que ya hace
 * `IncomeListSection` con el alta de un ingreso.
 */
export default function ExpenseForm({
  initialValues,
  fixedExpenseId,
  categoryListId,
  minDate,
  maxDate,
  busy,
  submitLabel = 'Guardar',
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const [concept, setConcept] = useState(initialValues?.concept ?? '')
  const [amount, setAmount] = useState(initialValues?.amount ?? '')
  const [date, setDate] = useState(initialValues?.date ?? maxDate)
  const [category, setCategory] = useState(initialValues?.category ?? '')
  const [note, setNote] = useState(initialValues?.note ?? '')

  const amountValue = parsePesos(amount)
  const canSubmit =
    concept.trim().length > 0 && amountValue !== null && amountValue > 0 && isISODate(date) && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || amountValue === null) return
    onSubmit({
      date,
      amount: amountValue,
      concept: concept.trim(),
      category: category.trim() || null,
      note: note.trim() || null,
      fixedExpenseId,
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 px-3 py-3">
      <input
        type="text"
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        placeholder="Concepto…"
        aria-label="Concepto del gasto"
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
        aria-label="Monto del gasto"
        disabled={busy}
        className={campoClass}
      />
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Fecha del gasto"
        disabled={busy}
        className={campoClass}
      />
      <input
        type="text"
        list={categoryListId}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Categoría (opcional)"
        aria-label="Categoría del gasto"
        disabled={busy}
        className={campoClass}
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (opcional)"
        aria-label="Nota del gasto"
        disabled={busy}
        className={campoClass}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
        >
          {submitLabel}
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
