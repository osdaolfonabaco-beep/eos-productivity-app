/**
 * El módulo de datos del comentario del día, contra Supabase.
 *
 * Uno por día (`unique (user_id, date)`); guardar el de hoy es un upsert —
 * misma forma que tenía el journal cuando era de una sola nota por día. Sin
 * archivar, sin borrar, sin historial navegable: la interfaz solo llega a
 * tocar el de hoy. A diferencia del journal, ESTE texto se manda a la IA en
 * el análisis diario y semanal (`./analysis.ts`) — por eso la interfaz avisa
 * junto al campo, en vez de dejarlo implícito.
 */

import { DAY_COMMENT_COLS, rowToDayComment } from './rows'
import { supabase, unwrap } from './supabase'
import type { DayComment } from './types'

/** El comentario de una fecha, o `undefined` si no se escribió ninguno. */
export async function getDayComment(date: string): Promise<DayComment | undefined> {
  const rows = unwrap(
    await supabase.from('day_comments').select(DAY_COMMENT_COLS).eq('date', date).limit(1),
    'getDayComment',
  )
  return rows[0] ? rowToDayComment(rows[0]) : undefined
}

/** Los comentarios entre `startDate` y `endDate` (ambos incluidos), para el dashboard semanal. */
export async function getDayCommentsInRange(
  startDate: string,
  endDate: string,
): Promise<DayComment[]> {
  const rows = unwrap(
    await supabase
      .from('day_comments')
      .select(DAY_COMMENT_COLS)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
    'getDayCommentsInRange',
  )
  return rows.map(rowToDayComment)
}

/**
 * Escribe el comentario de `date`: lo crea si no existe, o reemplaza su texto
 * si ya existe. Así es "editable durante ese día" — guardar de nuevo reemplaza.
 */
export async function saveDayComment(date: string, text: string): Promise<DayComment> {
  const clean = text.trim()
  if (!clean) throw new Error('El comentario no puede estar vacío')

  const rows = unwrap(
    await supabase
      .from('day_comments')
      .upsert({ date, text: clean }, { onConflict: 'user_id,date' })
      .select(DAY_COMMENT_COLS),
    'saveDayComment',
  )
  return rowToDayComment(rows[0])
}
