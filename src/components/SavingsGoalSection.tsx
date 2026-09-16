import { useState, type FormEvent } from 'react'
import {
  isISODate,
  savingsProgress,
  sumContributions,
  todayISO,
  type SavingsContribution,
  type SavingsGoal,
  type SavingsGoalInput,
} from '../data'
import { formatCOP, parsePesos } from '../money'
import { useMounted } from '../useMounted'

interface SavingsGoalSectionProps {
  /** `undefined` si no hay ninguna meta activa. */
  goal: SavingsGoal | undefined
  contributions: SavingsContribution[]
  busy: boolean
  onCreate: (input: SavingsGoalInput) => void
  onUpdate: (id: string, input: SavingsGoalInput) => void
  onArchive: (id: string) => void
  onAddContribution: (goalId: string, date: string, amount: number) => void
  onArchiveContribution: (id: string) => void
}

/** `2026-09-09` → `09 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

const campoClass =
  'rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'

/** El formulario de la meta: nombre, monto objetivo y fecha opcional. Sirve para crear y para editar. */
function GoalForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: SavingsGoal
  busy: boolean
  onSubmit: (input: SavingsGoalInput) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : '')
  const [date, setDate] = useState(initial?.targetDate ?? '')

  const targetAmount = parsePesos(target)
  const canSave = name.trim().length > 0 && targetAmount !== null && targetAmount > 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || targetAmount === null) return
    onSubmit({ name: name.trim(), targetAmount, targetDate: date || null })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la meta…"
        aria-label="Nombre de la meta"
        autoFocus
        disabled={busy}
        className={campoClass}
      />
      <input
        type="text"
        inputMode="numeric"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="Monto objetivo"
        aria-label="Monto objetivo"
        disabled={busy}
        className={campoClass}
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-apagado">Fecha objetivo (opcional)</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={busy}
          className={`${campoClass} py-2`}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSave || busy}
          className="rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
        >
          Guardar
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-campo border border-borde px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Barra de progreso de la meta: crece desde cero hasta su valor al montar
 * (técnica compartida con las barras de Deudas — ver `DebtsView`).
 * `transform: scaleX`, no `width`: es una operación de compositor.
 */
function GoalProgressBar({ percent }: { percent: number }) {
  const mounted = useMounted()
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-separador shadow-[var(--sombra-hundida)]">
      <div
        className="h-full origin-left rounded-full"
        style={{
          background: 'linear-gradient(to bottom, var(--color-acento), var(--color-acento-toque))',
          transform: mounted ? 'scaleX(1)' : 'scaleX(0)',
          width: `${percent}%`,
          transitionProperty: 'transform',
          transitionDuration: 'var(--dur-entrada)',
          transitionTimingFunction: 'var(--ease-salida)',
        }}
      />
    </div>
  )
}

/**
 * Bloque 3 de la vista Sueldo: la meta de ahorro activa (una sola a la vez),
 * su progreso, el campo para anotar un aporte y los últimos aportes. Sin
 * meta, muestra el estado vacío con el formulario para crearla.
 *
 * "Editar"/"Archivar" viven detrás del menú "⋯" (mismo patrón que
 * `MovementRow`), y "Anotar un aporte" empieza replegado en una línea que
 * despliega el formulario (mismo patrón que "+ Anotar un ingreso…" en
 * `MovementListSection`).
 */
export default function SavingsGoalSection({
  goal,
  contributions,
  busy,
  onCreate,
  onUpdate,
  onArchive,
  onAddContribution,
  onArchiveContribution,
}: SavingsGoalSectionProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-archive'>('view')
  const [menuOpen, setMenuOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [contribDate, setContribDate] = useState(todayISO())
  const [contribAmount, setContribAmount] = useState('')
  const [confirmingContribId, setConfirmingContribId] = useState<string | null>(null)

  if (!goal) {
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Meta de ahorro</h2>
        <div className="rounded-tarjeta border border-dashed border-borde bg-tarjeta p-4">
          <p className="mb-3 text-sm text-texto-apagado">Todavía no tienes una meta de ahorro.</p>
          <GoalForm busy={busy} onSubmit={onCreate} />
        </div>
      </section>
    )
  }

  if (mode === 'edit') {
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Meta de ahorro</h2>
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
          <GoalForm
            initial={goal}
            busy={busy}
            onSubmit={(input) => {
              onUpdate(goal.id, input)
              setMode('view')
            }}
            onCancel={() => setMode('view')}
          />
        </div>
      </section>
    )
  }

  const saved = sumContributions(contributions)
  const percent = Math.min(100, Math.round(savingsProgress(goal, contributions) * 100))
  const remaining = Math.max(0, goal.targetAmount - saved)

  const contribAmountValue = parsePesos(contribAmount)
  const canAddContrib =
    contribAmountValue !== null && contribAmountValue > 0 && isISODate(contribDate) && !busy

  function submitContribution(e: FormEvent) {
    e.preventDefault()
    if (!canAddContrib || contribAmountValue === null || !goal) return
    onAddContribution(goal.id, contribDate, contribAmountValue)
    setContribAmount('')
    setContribDate(todayISO())
    setFormOpen(false)
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Meta de ahorro</h2>

      {mode === 'confirm-archive' ? (
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
          <p className="text-sm text-texto-apagado">
            Se archivará: la meta y sus aportes se conservan. Podrás crear una meta nueva.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onArchive(goal.id)}
              disabled={busy}
              className="rounded-campo bg-fallado px-4 py-3 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
            >
              Archivar meta
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
      ) : (
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-contenido font-medium text-texto">{goal.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-sm font-semibold tabular-nums text-texto">{percent}%</span>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-label="Más acciones para la meta de ahorro"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              >
                ⋯
              </button>
            </div>
          </div>
          <GoalProgressBar percent={percent} />
          <p className="mt-2 text-sm tabular-nums text-texto-apagado">
            {formatCOP(saved)} de {formatCOP(goal.targetAmount)}
            {remaining > 0 && ` · faltan ${formatCOP(remaining)}`}
          </p>
          {goal.targetDate && (
            <p className="mt-0.5 text-xs text-texto-tenue">Meta: {formatShortDate(goal.targetDate)}</p>
          )}

          {menuOpen && (
            <div className="mt-3 flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setMode('edit')
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
      )}

      <div className="mt-4 overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        {formOpen ? (
          <div className="p-3">
            <h3 className="mb-2 text-sm font-medium text-texto-cuerpo">Anotar un aporte</h3>
            <form onSubmit={submitContribution} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-texto-apagado">Fecha</span>
                <input
                  type="date"
                  value={contribDate}
                  max={todayISO()}
                  onChange={(e) => setContribDate(e.target.value)}
                  disabled={busy}
                  className={`${campoClass} py-2`}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-texto-apagado">Monto</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={contribAmount}
                  onChange={(e) => setContribAmount(e.target.value)}
                  placeholder="$ 0"
                  disabled={busy}
                  className={`w-full ${campoClass} py-2`}
                />
              </label>
              <button
                type="submit"
                disabled={!canAddContrib}
                className="rounded-campo bg-texto px-4 py-2 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
              >
                Anotar
              </button>
            </form>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
          >
            <span aria-hidden="true">+</span>
            <span>Anotar un aporte</span>
          </button>
        )}
      </div>

      {contributions.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
          <ul>
            {contributions.slice(0, 5).map((c, i) => (
              <li
                key={c.id}
                className={i < Math.min(5, contributions.length) - 1 ? 'border-b-[0.5px] border-separador' : ''}
              >
                {confirmingContribId === c.id ? (
                  <div className="px-3 py-3">
                    <p className="text-sm text-texto-cuerpo">
                      ¿Archivar el aporte de {formatCOP(c.amount)} del {formatShortDate(c.date)}?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onArchiveContribution(c.id)
                          setConfirmingContribId(null)
                        }}
                        className="rounded-campo bg-fallado px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
                      >
                        Archivar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingContribId(null)}
                        className="rounded-campo border border-borde px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-texto-apagado">{formatShortDate(c.date)}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium tabular-nums text-texto">{formatCOP(c.amount)}</span>
                      <button
                        type="button"
                        onClick={() => setConfirmingContribId(c.id)}
                        className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
                        aria-label={`Archivar el aporte de ${formatCOP(c.amount)} del ${formatShortDate(c.date)}`}
                      >
                        Archivar
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
