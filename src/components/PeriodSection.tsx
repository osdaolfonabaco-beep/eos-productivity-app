import { useState, type FormEvent } from 'react'
import { quincenaLabel, type PeriodBreakdown } from '../data'
import { formatCOP, parsePesos } from '../money'

interface PeriodSectionProps {
  periodStart: string
  periodEnd: string
  breakdown: PeriodBreakdown
  busy: boolean
  onSetSalary: (amount: number) => void
}

const QUINCENA_TITLE: Record<'primera' | 'segunda', string> = {
  primera: 'Primera quincena',
  segunda: 'Segunda quincena',
}

/** `2026-09-16` → `16 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/**
 * Bloque 1 de la vista Sueldo: la quincena en curso, el sueldo (registrarlo o
 * corregirlo en línea) y el desglose completo del disponible, siempre
 * visible — es el número que más se va a mirar, así que nunca queda detrás
 * de un desplegable. Si da negativo se muestra en rojo, no se esconde.
 */
export default function PeriodSection({
  periodStart,
  periodEnd,
  breakdown,
  busy,
  onSetSalary,
}: PeriodSectionProps) {
  const salary = breakdown.salary
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(salary ? String(salary.amount) : '')

  const draftAmount = parsePesos(draft)
  const canSave = draftAmount !== null && draftAmount > 0 && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || draftAmount === null) return
    onSetSalary(draftAmount)
    setEditing(false)
  }

  const negative = salary !== undefined && breakdown.available < 0

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        {QUINCENA_TITLE[quincenaLabel(periodStart)]} · {formatShortDate(periodStart)} –{' '}
        {formatShortDate(periodEnd)}
      </h2>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        {!salary || editing ? (
          <form onSubmit={submit} className="flex flex-col gap-2">
            {!salary && (
              <p className="mb-1 text-sm text-gray-500">
                Aún no registras el sueldo de esta quincena.
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
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
                className="rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canSave}
                className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                Guardar
              </button>
              {salary && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-gray-500">Sueldo</span>
              <button
                type="button"
                onClick={() => {
                  setDraft(String(salary.amount))
                  setEditing(true)
                }}
                className="text-sm font-medium text-gray-500"
              >
                Editar
              </button>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{formatCOP(salary.amount)}</p>

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Gastos fijos de esta quincena</dt>
                <dd className="tabular-nums">− {formatCOP(breakdown.fixedExpensesTotal)}</dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Pagos a deudas de este período</dt>
                <dd className="tabular-nums">− {formatCOP(breakdown.debtPaymentsTotal)}</dd>
              </div>
              <div
                className={`flex justify-between border-t border-gray-100 pt-1.5 font-semibold ${
                  negative ? 'text-rose-600' : 'text-gray-900'
                }`}
              >
                <dt>Disponible</dt>
                <dd className="tabular-nums">{formatCOP(breakdown.available)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </section>
  )
}
