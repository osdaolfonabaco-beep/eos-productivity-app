import { useCallback, useMemo, useState } from 'react'
import {
  addGoalUpdate,
  archiveGoal,
  createWeeklyGoal,
  listGoalUpdates,
  listWeeklyGoals,
  setGoalResult,
  startOfWeekISO,
  todayISO,
  updateGoalText,
  type GoalDirection,
  type GoalResult,
  type GoalUpdate,
  type WeeklyGoal,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, LoadError, Loading } from './ViewState'

const MAX_GOALS = 3

/** `2026-09-08` → `08 sept`. Solo para mostrar. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

/** Flecha hacia abajo, que gira al expandir. Mismo criterio de icono a mano que el resto de la app (ver SentIcon en DayCommentSection). */
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

type Mode = 'view' | 'edit' | 'confirm-archive'

interface GoalRowProps {
  goal: WeeklyGoal
  updates: GoalUpdate[]
  busy: boolean
  onSaveText: (text: string) => void
  onSetResult: (resultado: GoalResult | null) => void
  onArchive: () => void
  onAddUpdate: (text: string, direction: GoalDirection) => void
}

/**
 * Una meta, como fila de la tarjeta "Metas de la semana".
 *
 * En reposo es una fila compacta: texto + un punto de estado (si ya tiene
 * resultado). Una meta trae más contenido que un hábito (pastillas de
 * resultado, bitácora de avances, campo para anotar uno nuevo), así que no
 * cabe aplanada — al tocar la fila se expande y aparece todo eso, con
 * Editar/Archivar como enlaces de texto al final. Edición y confirmación de
 * archivado reemplazan el contenido entero de la fila mientras están
 * activas, igual que en `HabitManageRow` / `TaskRow`.
 */
function GoalRow({ goal, updates, busy, onSaveText, onSetResult, onArchive, onAddUpdate }: GoalRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(goal.text)
  const [updateText, setUpdateText] = useState('')

  function save() {
    const clean = draft.trim()
    if (!clean) return
    onSaveText(clean)
    setMode('view')
  }

  function submitUpdate(direction: GoalDirection) {
    const clean = updateText.trim()
    if (!clean || busy) return
    setUpdateText('')
    onAddUpdate(clean, direction)
  }

  if (mode === 'edit') {
    return (
      <div className="px-3 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          aria-label="Texto de la meta"
          className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(goal.text)
              setMode('view')
            }}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
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
        <p className="text-sm text-texto-apagado">Se archivará: la meta y sus avances se conservan.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
          >
            Archivar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-3 text-left transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
      >
        {goal.resultado && (
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              goal.resultado === 'cumplida'
                ? 'bg-[image:var(--grad-ind-hecho)] shadow-[var(--sombra-ind-hecho)]'
                : 'bg-[image:var(--grad-ind-fallado)] shadow-[var(--sombra-ind-fallado)]'
            }`}
          />
        )}
        <span className="sr-only">
          {goal.resultado === 'cumplida' ? 'Cumplida. ' : goal.resultado === 'no-cumplida' ? 'No cumplida. ' : ''}
        </span>
        <span className="min-w-0 flex-1 break-words text-contenido text-texto-cuerpo">{goal.text}</span>
        <span
          className={`shrink-0 text-texto-tenue transition-transform duration-[var(--dur-toque)] ease-toque ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronIcon />
        </span>
      </button>

      {expanded && (
        <div className="border-t-[0.5px] border-separador px-3 pb-3 pt-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onSetResult(goal.resultado === 'cumplida' ? null : 'cumplida')}
              aria-pressed={goal.resultado === 'cumplida'}
              disabled={busy}
              className={`rounded-pastilla px-3 py-1 text-xs font-medium transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] ${
                goal.resultado === 'cumplida'
                  ? 'bg-[image:var(--grad-hecho)] text-white shadow-[var(--sombra-hecho)] active:shadow-[var(--sombra-hecho-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none'
                  : 'border border-borde text-texto-apagado active:bg-separador disabled:opacity-60'
              }`}
            >
              Cumplida
            </button>
            <button
              type="button"
              onClick={() => onSetResult(goal.resultado === 'no-cumplida' ? null : 'no-cumplida')}
              aria-pressed={goal.resultado === 'no-cumplida'}
              disabled={busy}
              className={`rounded-pastilla px-3 py-1 text-xs font-medium transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] ${
                goal.resultado === 'no-cumplida'
                  ? 'bg-[image:var(--grad-fallado)] text-white shadow-[var(--sombra-fallado)] active:shadow-[var(--sombra-fallado-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none'
                  : 'border border-borde text-texto-apagado active:bg-separador disabled:opacity-60'
              }`}
            >
              No cumplida
            </button>
          </div>

          {updates.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {updates.map((u) => (
                <li key={u.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-xs text-texto-tenue">{formatShortDate(u.date)}</span>
                  <span
                    className={`shrink-0 font-bold ${u.direction === 'acerca' ? 'text-hecho' : 'text-fallado'}`}
                    aria-hidden="true"
                  >
                    {u.direction === 'acerca' ? '↑' : '↓'}
                  </span>
                  <span className="sr-only">{u.direction === 'acerca' ? 'Avance: ' : 'Retroceso: '}</span>
                  <span className="min-w-0 flex-1 break-words text-texto-cuerpo">{u.text}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <input
              type="text"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              placeholder="Anota un avance…"
              aria-label="Anota un avance"
              disabled={busy}
              className="rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submitUpdate('acerca')}
                disabled={!updateText.trim() || busy}
                className="flex-1 rounded-campo bg-hecho-suave px-3 py-2 text-sm font-medium text-hecho transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
              >
                ↑ Acerca
              </button>
              <button
                type="button"
                onClick={() => submitUpdate('aleja')}
                disabled={!updateText.trim() || busy}
                className="flex-1 rounded-campo bg-fallado-suave px-3 py-2 text-sm font-medium text-fallado transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-40"
              >
                ↓ Aleja
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-4">
            <button
              type="button"
              onClick={() => {
                setDraft(goal.text)
                setMode('edit')
              }}
              className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setMode('confirm-archive')}
              className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
            >
              Archivar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface GoalRowData {
  goal: WeeklyGoal
  updates: GoalUpdate[]
}

/**
 * Metas de la semana en curso, encima de la cuadrícula de Vida -> Semana.
 * Hasta 3 activas (lo valida `createWeeklyGoal`); sin navegación a otras
 * semanas, igual que el resto de esta pantalla.
 */
export default function WeeklyGoalsSection() {
  const weekStart = useMemo(() => startOfWeekISO(todayISO()), [])

  const fetcher = useCallback(async (): Promise<GoalRowData[]> => {
    const goals = await listWeeklyGoals(weekStart)
    const updatesByGoal = await Promise.all(goals.map((g) => listGoalUpdates(g.id)))
    return goals.map((goal, i) => ({ goal, updates: updatesByGoal[i] }))
  }, [weekStart])

  const { data, loading, error, reload } = useAsyncData(fetcher, [weekStart])

  const [formOpen, setFormOpen] = useState(false)
  const [newGoalText, setNewGoalText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : message)
      reload()
    } finally {
      setBusy(false)
    }
  }

  function submitNewGoal() {
    const clean = newGoalText.trim()
    if (!clean || busy) return
    setNewGoalText('')
    setFormOpen(false)
    void run(() => createWeeklyGoal(weekStart, clean), 'No se pudo crear la meta.')
  }

  function cancelNewGoal() {
    setNewGoalText('')
    setFormOpen(false)
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const rows = data ?? []

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">Metas de la semana</h2>

      {actionError && (
        <div className="mb-3">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        {rows.length === 0 && (
          <p className="flex min-h-11 items-center border-b-[0.5px] border-separador px-3 text-texto-tenue">
            Todavía no has fijado ninguna meta esta semana.
          </p>
        )}

        {rows.length > 0 && (
          <ul>
            {rows.map(({ goal, updates }, i) => (
              <li key={goal.id} className={i < rows.length - 1 ? 'border-b-[0.5px] border-separador' : ''}>
                <GoalRow
                  goal={goal}
                  updates={updates}
                  busy={busy}
                  onSaveText={(text) =>
                    void run(() => updateGoalText(goal.id, text), 'No se pudo guardar.')
                  }
                  onSetResult={(resultado) =>
                    void run(() => setGoalResult(goal.id, resultado), 'No se pudo guardar.')
                  }
                  onArchive={() => void run(() => archiveGoal(goal.id), 'No se pudo archivar.')}
                  onAddUpdate={(text, direction) =>
                    void run(
                      () => addGoalUpdate(goal.id, todayISO(), text, direction),
                      'No se pudo guardar el avance.',
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {rows.length < MAX_GOALS ? (
          formOpen ? (
            <div className="flex flex-wrap items-center gap-2 px-3 py-3">
              <input
                type="text"
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitNewGoal()
                  }
                }}
                placeholder="Escribe una meta nueva…"
                aria-label="Escribe una meta nueva"
                autoFocus
                disabled={busy}
                className="min-w-0 flex-1 rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60"
              />
              <button
                type="button"
                onClick={submitNewGoal}
                disabled={!newGoalText.trim() || busy}
                className="shrink-0 rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={cancelNewGoal}
                className="shrink-0 rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-separador"
            >
              <span aria-hidden="true">+</span>
              <span>Añadir meta</span>
            </button>
          )
        ) : (
          <p className="flex min-h-11 items-center px-3 text-texto-tenue">Ya tienes {MAX_GOALS} metas esta semana.</p>
        )}
      </div>
    </section>
  )
}
