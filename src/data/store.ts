/**
 * El módulo de datos de hábitos, ahora contra Supabase.
 *
 * Las lecturas y escrituras son `async`. Las filas vienen filtradas por RLS
 * (solo las del usuario) y `user_id` lo pone el servidor. Los helpers puros
 * (`entryStatus`) siguen siendo síncronos: operan sobre datos ya traídos.
 */

import { isISODate } from './dates'
import { ENTRY_COLS, HABIT_COLS, habitToRow, rowToEntry, rowToHabit } from './rows'
import { supabase, unwrap } from './supabase'
import type { EntryStatus, Habit, HabitEntry } from './types'

// --- Hábitos -------------------------------------------------------------

/** Los hábitos activos (no archivados), ordenados por `order`. */
export async function listHabits(): Promise<Habit[]> {
  const rows = unwrap(
    await supabase
      .from('habits')
      .select(HABIT_COLS)
      .eq('archived', false)
      .order('sort_order', { ascending: true }),
    'listHabits',
  )
  return rows.map(rowToHabit)
}

/**
 * Todos los hábitos, activos y archivados, sin ordenar por `order` (ese
 * orden solo tiene sentido para la lista activa). Para cálculos que miran
 * hacia atrás y necesitan hábitos que ya no están activos hoy pero sí lo
 * estuvieron en el pasado -- ver `getWeekCompletionPercentages` en
 * `./weeklyStats`, que es quien la usa.
 */
export async function listAllHabits(): Promise<Habit[]> {
  const rows = unwrap(await supabase.from('habits').select(HABIT_COLS), 'listAllHabits')
  return rows.map(rowToHabit)
}

/** Un hábito por id, o `undefined` si no existe. Incluye los archivados. */
export async function getHabit(id: string): Promise<Habit | undefined> {
  const rows = unwrap(
    await supabase.from('habits').select(HABIT_COLS).eq('id', id).limit(1),
    'getHabit',
  )
  return rows[0] ? rowToHabit(rows[0]) : undefined
}

/**
 * Crea un hábito activo. `name` se recorta; si queda vacío, lanza error.
 * El hábito nuevo va al final: `order = (máximo actual) + 1`.
 */
export async function createHabit(name: string): Promise<Habit> {
  const clean = name.trim()
  if (!clean) throw new Error('El nombre del hábito no puede estar vacío')

  const top = unwrap(
    await supabase
      .from('habits')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1),
    'createHabit (orden)',
  )
  const maxOrder = top[0] ? top[0].sort_order : -1

  const habit: Habit = {
    id: crypto.randomUUID(),
    name: clean,
    createdAt: new Date().toISOString(),
    archived: false,
    order: maxOrder + 1,
  }
  const rows = unwrap(
    await supabase.from('habits').insert(habitToRow(habit)).select(HABIT_COLS),
    'createHabit',
  )
  return rowToHabit(rows[0])
}

/**
 * Renombra un hábito. Es lo único editable de un hábito.
 * No toca ningún `HabitEntry`.
 */
export async function renameHabit(id: string, name: string): Promise<Habit> {
  const clean = name.trim()
  if (!clean) throw new Error('El nombre del hábito no puede estar vacío')

  const rows = unwrap(
    await supabase.from('habits').update({ name: clean }).eq('id', id).select(HABIT_COLS),
    'renameHabit',
  )
  if (!rows[0]) throw new Error(`No existe el hábito ${id}`)
  return rowToHabit(rows[0])
}

/**
 * Archiva un hábito (el botón "Eliminar"): deja de aparecer en las listas
 * activas pero se conserva con sus registros. Idempotente.
 */
export async function archiveHabit(id: string): Promise<void> {
  const res = await supabase.from('habits').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveHabit: ${res.error.message}`)
}

// --- Registros diarios -------------------------------------------------

/** El registro de un hábito en una fecha, o `undefined` si está sin responder. */
export async function getEntry(
  habitId: string,
  date: string,
): Promise<HabitEntry | undefined> {
  const rows = unwrap(
    await supabase
      .from('habit_entries')
      .select(ENTRY_COLS)
      .eq('habit_id', habitId)
      .eq('date', date)
      .limit(1),
    'getEntry',
  )
  return rows[0] ? rowToEntry(rows[0]) : undefined
}

/** Todos los registros de una fecha. Para la vista del día. */
export async function getEntriesForDate(date: string): Promise<HabitEntry[]> {
  const rows = unwrap(
    await supabase.from('habit_entries').select(ENTRY_COLS).eq('date', date),
    'getEntriesForDate',
  )
  return rows.map(rowToEntry)
}

/**
 * Todos los registros entre `startDate` y `endDate` (`YYYY-MM-DD`), extremos
 * incluidos. Para la cuadrícula de la semana.
 */
export async function getEntriesInRange(
  startDate: string,
  endDate: string,
): Promise<HabitEntry[]> {
  const rows = unwrap(
    await supabase
      .from('habit_entries')
      .select(ENTRY_COLS)
      .gte('date', startDate)
      .lte('date', endDate),
    'getEntriesInRange',
  )
  return rows.map(rowToEntry)
}

/**
 * Fija si un hábito se cumplió (`done`) o no en una fecha. Crea el registro o
 * actualiza el de ese `(hábito, día)` — la tabla tiene índice único sobre ese par.
 */
export async function setEntryDone(
  habitId: string,
  date: string,
  done: boolean,
): Promise<HabitEntry> {
  if (!isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }
  const rows = unwrap(
    await supabase
      .from('habit_entries')
      .upsert({ habit_id: habitId, date, done }, { onConflict: 'habit_id,date' })
      .select(ENTRY_COLS),
    'setEntryDone',
  )
  return rowToEntry(rows[0])
}

/**
 * Borra el registro de un hábito en una fecha: ese día vuelve a "sin responder".
 * Si no había registro, no pasa nada.
 */
export async function clearEntry(habitId: string, date: string): Promise<void> {
  const res = await supabase
    .from('habit_entries')
    .delete()
    .eq('habit_id', habitId)
    .eq('date', date)
  if (res.error) throw new Error(`clearEntry: ${res.error.message}`)
}

/** Traduce un registro (o su ausencia) a los tres estados de la interfaz. */
export function entryStatus(entry: HabitEntry | undefined): EntryStatus {
  if (!entry) return 'unanswered'
  return entry.done ? 'done' : 'not-done'
}
