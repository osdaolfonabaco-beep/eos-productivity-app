import { useState } from 'react'
import { isISODate, type Income, type IncomeInput } from '../data'
import { formatCOP, parsePesos } from '../money'

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

interface IncomeRowProps {
  income: Income
  /** Id del `<datalist>` de categorías ya usadas, montado una vez en `IncomeListSection`. */
  categoryListId: string
  minDate: string
  maxDate: string
  busy: boolean
  onUpdate: (input: IncomeInput) => void
  onArchive: () => void
}

type Mode = 'view' | 'edit' | 'confirm-archive'

/** `2026-09-09` → `09 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * Una fila de "Ingresos de la quincena": ver (franja izquierda transparente,
 * a diferencia de la fila sintética del sueldo), editar en línea y archivar
 * con confirmación de dos toques — mismo patrón que `FixedExpenseRow`.
 *
 * Un ingreso no tiene un campo de "nombre": el concepto que se muestra es la
 * nota si existe, si no la categoría, si no un genérico "Ingreso".
 */
export default function IncomeRow({
  income,
  categoryListId,
  minDate,
  maxDate,
  busy,
  onUpdate,
  onArchive,
}: IncomeRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [menuOpen, setMenuOpen] = useState(false)
  const [date, setDate] = useState(income.date)
  const [amount, setAmount] = useState(String(income.amount))
  const [category, setCategory] = useState(income.category ?? '')
  const [note, setNote] = useState(income.note ?? '')

  function startEdit() {
    setDate(income.date)
    setAmount(String(income.amount))
    setCategory(income.category ?? '')
    setNote(income.note ?? '')
    setMode('edit')
  }

  const amountValue = parsePesos(amount)
  const canSave = amountValue !== null && amountValue > 0 && isISODate(date)

  function save() {
    if (!canSave || amountValue === null) return
    onUpdate({
      date,
      amount: amountValue,
      category: category.trim() || null,
      note: note.trim() || null,
    })
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="px-3 py-3">
        <div className="flex flex-col gap-2">
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
        <p className="text-sm text-texto-apagado">Se archivará. El historial se conserva.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={busy}
            className="rounded-campo bg-fallado px-4 py-3 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
          >
            Archivar
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

  const concept = income.note || income.category || 'Ingreso'
  // La categoría solo se repite en la meta si no es ya lo que se muestra como
  // concepto (sin nota, el concepto ES la categoría — repetirla no dice nada nuevo).
  const showCategoryInMeta = Boolean(income.category) && Boolean(income.note)

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2 border-l-[3px] border-l-transparent px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-contenido font-medium text-texto">{concept}</p>
          <p className="text-meta text-texto-apagado">
            {formatShortDate(income.date)}
            {showCategoryInMeta && ` · ${income.category}`}
          </p>
        </div>
        <span className="shrink-0 font-medium tabular-nums text-texto">{formatCOP(income.amount)}</span>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Más acciones para este ingreso"
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
