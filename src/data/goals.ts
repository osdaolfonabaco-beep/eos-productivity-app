/**
 * El módulo de datos de metas semanales, contra Supabase.
 *
 * Una meta pertenece a la semana de su `weekStart` (el lunes de esa semana);
 * la interfaz solo gestiona la semana en curso, sin navegación a otras. Hasta
 * 3 metas activas por semana — lo valida `createWeeklyGoal`, no una
 * restricción de la base de datos: es una regla de producto ligera, no de
 * integridad. El texto se puede editar en el sitio (archivar y recrear
 * perdería los avances, que cuelgan del id de la meta). Los avances son una
 * bitácora de solo-añadir, igual que `HabitEntry` o `Payment`.
 */

import { isISODate } from './dates'
import { GOAL_COLS, GOAL_UPDATE_COLS, goalToRow, goalUpdateToRow, rowToGoal, rowToGoalUpdate } from './rows'
import { supabase, unwrap } from './supabase'
import type { GoalDirection, GoalResult, GoalUpdate, WeeklyGoal } from './types'

const MAX_GOALS_PER_WEEK = 3

/** Las metas activas de una semana (por su lunes), en el orden en que se crearon. */
export async function listWeeklyGoals(weekStart: string): Promise<WeeklyGoal[]> {
  const rows = unwrap(
    await supabase
      .from('weekly_goals')
      .select(GOAL_COLS)
      .eq('week_start', weekStart)
      .eq('archived', false)
      .order('created_at', { ascending: true }),
    'listWeeklyGoals',
  )
  return rows.map(rowToGoal)
}

/** Crea una meta para esa semana. Lanza si ya hay `MAX_GOALS_PER_WEEK` activas. */
export async function createWeeklyGoal(weekStart: string, text: string): Promise<WeeklyGoal> {
  const clean = text.trim()
  if (!clean) throw new Error('La meta no puede estar vacía')

  const existing = await listWeeklyGoals(weekStart)
  if (existing.length >= MAX_GOALS_PER_WEEK) {
    throw new Error(`Ya tienes ${MAX_GOALS_PER_WEEK} metas esta semana`)
  }

  const goal: WeeklyGoal = {
    id: crypto.randomUUID(),
    weekStart,
    text: clean,
    resultado: null,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('weekly_goals').insert(goalToRow(goal)).select(GOAL_COLS),
    'createWeeklyGoal',
  )
  return rowToGoal(rows[0])
}

/** Cambia el texto de una meta. No toca sus avances ni su resultado. */
export async function updateGoalText(id: string, text: string): Promise<WeeklyGoal> {
  const clean = text.trim()
  if (!clean) throw new Error('La meta no puede estar vacía')

  const rows = unwrap(
    await supabase.from('weekly_goals').update({ text: clean }).eq('id', id).select(GOAL_COLS),
    'updateGoalText',
  )
  if (!rows[0]) throw new Error(`No existe la meta ${id}`)
  return rowToGoal(rows[0])
}

/**
 * Fija el resultado al cerrar la semana, o `null` para dejarla sin cerrar de
 * nuevo (las dos pastillas son un interruptor, no una decisión de una sola vía).
 */
export async function setGoalResult(id: string, resultado: GoalResult | null): Promise<void> {
  const res = await supabase.from('weekly_goals').update({ resultado }).eq('id', id)
  if (res.error) throw new Error(`setGoalResult: ${res.error.message}`)
}

/** Archiva una meta: sale de la lista, ella y sus avances se conservan. Idempotente. */
export async function archiveGoal(id: string): Promise<void> {
  const res = await supabase.from('weekly_goals').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveGoal: ${res.error.message}`)
}

// --- Avances -----------------------------------------------------------

/** Los avances de una meta, del más antiguo al más reciente. */
export async function listGoalUpdates(goalId: string): Promise<GoalUpdate[]> {
  const rows = unwrap(
    await supabase
      .from('goal_updates')
      .select(GOAL_UPDATE_COLS)
      .eq('goal_id', goalId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true }),
    'listGoalUpdates',
  )
  return rows.map(rowToGoalUpdate)
}

/** Anota un avance o retroceso bajo una meta, con la fecha de hoy. */
export async function addGoalUpdate(
  goalId: string,
  date: string,
  text: string,
  direction: GoalDirection,
): Promise<GoalUpdate> {
  const clean = text.trim()
  if (!clean) throw new Error('El avance no puede estar vacío')
  if (!isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }

  const update: GoalUpdate = {
    id: crypto.randomUUID(),
    goalId,
    date,
    text: clean,
    direction,
    createdAt: new Date().toISOString(),
  }
  const rows = unwrap(
    await supabase.from('goal_updates').insert(goalUpdateToRow(update)).select(GOAL_UPDATE_COLS),
    'addGoalUpdate',
  )
  return rowToGoalUpdate(rows[0])
}
