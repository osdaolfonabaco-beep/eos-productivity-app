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

type Mode = 'view' | 'edit' | 'confirm-archive'

interface GoalCardProps {
  goal: WeeklyGoal
  updates: GoalUpdate[]
  busy: boolean
  onSaveText: (text: string) => void
  onSetResult: (resultado: GoalResult | null) => void
  onArchive: () => void
  onAddUpdate: (text: string, direction: GoalDirection) => void
}

/**
 * Una meta: su texto (editable en el sitio — archivar y recrear perdería los
 * avances), las pastillas de resultado (interruptor, como el estado de una
 * idea), su bitácora de avances/retrocesos, el campo para anotar uno nuevo, y
 * archivar con confirmación de dos toques.
 */
function GoalCard({ goal, updates, busy, onSaveText, onSetResult, onArchive, onAddUpdate }: GoalCardProps) {
  const [mode, setMode] = useState<Mode>('view')
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
      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          aria-label="Texto de la meta"
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(goal.text)
              setMode('view')
            }}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-archive') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
        <p className="text-sm text-gray-700">Se archivará: la meta y sus avances se conservan.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white"
          >
            Archivar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="break-words text-base font-medium text-gray-900">{goal.text}</p>

      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={() => onSetResult(goal.resultado === 'cumplida' ? null : 'cumplida')}
          aria-pressed={goal.resultado === 'cumplida'}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60 ${
            goal.resultado === 'cumplida'
              ? 'bg-green-600 text-white'
              : 'border border-gray-300 text-gray-600'
          }`}
        >
          Cumplida
        </button>
        <button
          type="button"
          onClick={() => onSetResult(goal.resultado === 'no-cumplida' ? null : 'no-cumplida')}
          aria-pressed={goal.resultado === 'no-cumplida'}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60 ${
            goal.resultado === 'no-cumplida'
              ? 'bg-rose-600 text-white'
              : 'border border-gray-300 text-gray-600'
          }`}
        >
          No cumplida
        </button>
      </div>

      {updates.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {updates.map((u) => (
            <li key={u.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0 text-xs text-gray-400">{formatShortDate(u.date)}</span>
              <span
                className={`shrink-0 font-bold ${u.direction === 'acerca' ? 'text-green-600' : 'text-rose-600'}`}
                aria-hidden="true"
              >
                {u.direction === 'acerca' ? '↑' : '↓'}
              </span>
              <span className="sr-only">{u.direction === 'acerca' ? 'Avance: ' : 'Retroceso: '}</span>
              <span className="min-w-0 flex-1 break-words text-gray-700">{u.text}</span>
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submitUpdate('acerca')}
            disabled={!updateText.trim() || busy}
            className="flex-1 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-40"
          >
            ↑ Acerca
          </button>
          <button
            type="button"
            onClick={() => submitUpdate('aleja')}
            disabled={!updateText.trim() || busy}
            className="flex-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-40"
          >
            ↓ Aleja
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => {
            setDraft(goal.text)
            setMode('edit')
          }}
          className="text-sm font-medium text-gray-500"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => setMode('confirm-archive')}
          className="text-sm font-medium text-gray-500"
        >
          Archivar
        </button>
      </div>
    </div>
  )
}

interface GoalRow {
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

  const fetcher = useCallback(async (): Promise<GoalRow[]> => {
    const goals = await listWeeklyGoals(weekStart)
    const updatesByGoal = await Promise.all(goals.map((g) => listGoalUpdates(g.id)))
    return goals.map((goal, i) => ({ goal, updates: updatesByGoal[i] }))
  }, [weekStart])

  const { data, loading, error, reload } = useAsyncData(fetcher, [weekStart])

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
    void run(() => createWeeklyGoal(weekStart, clean), 'No se pudo crear la meta.')
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const rows = data ?? []

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Metas de la semana</h2>

      {actionError && (
        <div className="mb-3">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">Todavía no has fijado ninguna meta esta semana.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-3">
          {rows.map(({ goal, updates }) => (
            <li key={goal.id}>
              <GoalCard
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
        <div className="flex gap-2">
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
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submitNewGoal}
            disabled={!newGoalText.trim() || busy}
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Ya tienes {MAX_GOALS} metas esta semana.</p>
      )}
    </section>
  )
}
