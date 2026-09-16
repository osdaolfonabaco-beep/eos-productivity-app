import { useState, type FormEvent } from 'react'
import { quincenaLabel, type PeriodBreakdown } from '../data'
import { formatCOP, parsePesos } from '../money'

interface PeriodSectionProps {
  periodStart: string
  periodEnd: string
  breakdown: PeriodBreakdown
  busy: boolean
  /** `false` mientras se navega a una quincena pasada. */
  isCurrentPeriod: boolean
  onPrevious: () => void
  /** No hace nada si ya se está en la quincena en curso (no hay futuro). */
  onNext: () => void
  onGoToToday: () => void
  onSetSalary: (amount: number) => void
  /** Solo se llama cuando ya hay un sueldo registrado (el menú "⋯" no aparece si no). */
  onRemoveSalary: () => void
}

const QUINCENA_TITLE: Record<'primera' | 'segunda', string> = {
  primera: 'Primera quincena',
  segunda: 'Segunda quincena',
}

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

const arrowButtonClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-30'

/** `2026-09-16` → `16 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * Bloque 1 de la vista Sueldo: la quincena visitada (con flechas para
 * navegar; sin límite hacia atrás, nunca hacia el futuro) y el desglose
 * completo del disponible, siempre visible — es el número que más se va a
 * mirar, así que nunca queda detrás de un desplegable. Sueldo, gastos fijos
 * y pagos a deudas son filas neutras; Disponible es la única cifra
 * destacada, porque es la única que responde "cuánto puedo gastar". Si da
 * negativo se muestra en --color-fallado, no se esconde.
 */
export default function PeriodSection({
  periodStart,
  periodEnd,
  breakdown,
  busy,
  isCurrentPeriod,
  onPrevious,
  onNext,
  onGoToToday,
  onSetSalary,
  onRemoveSalary,
}: PeriodSectionProps) {
  const salary = breakdown.salary
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [draft, setDraft] = useState(salary ? String(salary.amount) : '')

  const draftAmount = parsePesos(draft)
  const canSave = draftAmount !== null && draftAmount > 0 && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || draftAmount === null) return
    onSetSalary(draftAmount)
    setEditing(false)
  }

  function startEdit() {
    if (!salary) return
    setDraft(String(salary.amount))
    setEditing(true)
  }

  const negative = salary !== undefined && breakdown.available < 0

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={onPrevious} aria-label="Quincena anterior" className={arrowButtonClass}>
          ‹
        </button>

        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-sm font-semibold text-texto-cuerpo">
            {QUINCENA_TITLE[quincenaLabel(periodStart)]} · {formatShortDate(periodStart)} –{' '}
            {formatShortDate(periodEnd)}
          </h2>
          {!isCurrentPeriod && (
            <button
              type="button"
              onClick={onGoToToday}
              className="mt-0.5 text-xs font-medium text-texto-apagado underline underline-offset-2"
            >
              Quincena pasada · Volver a hoy
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={isCurrentPeriod}
          aria-label="Quincena siguiente"
          className={arrowButtonClass}
        >
          ›
        </button>
      </div>

      <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
        {!salary || editing ? (
          <form onSubmit={submit} className="flex flex-col gap-2">
            {!salary && (
              <p className="mb-1 text-sm text-texto-apagado">
                Aún no registras el sueldo de esta quincena.
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-texto-cuerpo">
                {salary ? 'Corregir el sueldo' : 'Sueldo de esta quincena'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="$ 0"
                autoFocus
                disabled={busy}
                className={campoClass}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canSave}
                className="rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
              >
                Guardar
              </button>
              {salary && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : confirmingRemove ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-texto-apagado">
              Se quitará el sueldo de esta quincena. Solo afecta a esta quincena y se puede volver
              a poner.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onRemoveSalary()
                  setConfirmingRemove(false)
                }}
                disabled={busy}
                className="rounded-campo bg-acento px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-acento-toque)] active:shadow-[var(--sombra-acento-toque)] disabled:opacity-40"
              >
                Quitar sueldo
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <dl className="flex flex-col text-sm">
            <div className="flex items-baseline justify-between gap-2 border-b-[0.5px] border-separador pb-2">
              <dt className="text-texto-cuerpo">Sueldo</dt>
              <dd className="flex items-center gap-2 tabular-nums text-texto-cuerpo">
                {formatCOP(salary.amount)}
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-label="Más acciones para el sueldo"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                >
                  ⋯
                </button>
              </dd>
            </div>
            {menuOpen && (
              <div className="flex gap-4 border-b-[0.5px] border-separador pb-2 pt-1">
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
                    setConfirmingRemove(true)
                  }}
                  className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
                >
                  Quitar sueldo
                </button>
              </div>
            )}
            {breakdown.incomesTotal > 0 && (
              <div className="flex justify-between gap-2 border-b-[0.5px] border-separador py-2 text-texto-cuerpo">
                <dt>Ingresos extra de esta quincena</dt>
                <dd className="tabular-nums">+ {formatCOP(breakdown.incomesTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2 border-b-[0.5px] border-separador py-2 text-texto-cuerpo">
              <dt>Gastos reales de esta quincena</dt>
              <dd className="tabular-nums">− {formatCOP(breakdown.expensesTotal)}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b-[0.5px] border-separador py-2 text-texto-cuerpo">
              <dt>Gastos fijos pendientes</dt>
              <dd className="tabular-nums">− {formatCOP(breakdown.pendingFixedExpensesTotal)}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b-[0.5px] border-separador py-2 text-texto-cuerpo">
              <dt>Pagos a deudas de este período</dt>
              <dd className="tabular-nums">− {formatCOP(breakdown.debtPaymentsTotal)}</dd>
            </div>
            <div
              className={`flex items-baseline justify-between gap-2 pt-2.5 font-semibold ${
                negative ? 'text-fallado' : 'text-hecho'
              }`}
            >
              <dt className="text-sm text-texto">Disponible ahora</dt>
              <dd className="text-destacado tabular-nums">{formatCOP(breakdown.available)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 pt-1 text-texto-apagado">
              <dt className="text-xs">Queda si pagas lo pendiente</dt>
              <dd className="text-sm tabular-nums">{formatCOP(breakdown.projected)}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  )
}
