/**
 * El módulo de datos del historial del mentor, contra Supabase.
 *
 * Dos piezas independientes:
 * - `mentor_analyses`: cada análisis que el mentor produjo, de solo-añadir
 *   (como `HabitEntry` o `Payment`) -- nunca se sobrescribe, se archiva.
 * - `mentor_summary`: el resumen acumulado, una sola fila por usuario que se
 *   reescribe (mismo patrón que `journal_key`, ver `journalKey.ts`).
 *
 * Este módulo SOLO guarda y lee. Nada aquí decide cuándo guardar un análisis
 * ni cuándo reescribir el resumen -- lo primero lo llama `./analysis.ts`
 * después de recibir la respuesta de la IA; lo segundo, por ahora, no lo
 * llama nadie todavía.
 */

import { isISODate } from './dates'
import {
  MENTOR_ANALYSIS_COLS,
  MENTOR_SUMMARY_COLS,
  mentorAnalysisToRow,
  rowToMentorAnalysis,
  rowToMentorSummary,
} from './rows'
import { supabase, unwrap } from './supabase'
import type { Tone } from './preferences'
import type { MentorAnalysis, MentorAnalysisType, MentorSummary } from './types'

/** Los campos que hacen falta para guardar un análisis ya producido. */
export interface MentorAnalysisInput {
  tipo: MentorAnalysisType
  periodStart: string
  periodEnd: string
  tono: Tone
  incluyoDinero: boolean
  contenido: string
}

function assertValidInput(input: MentorAnalysisInput): void {
  if (!input.contenido.trim()) {
    throw new Error('El análisis no puede estar vacío')
  }
  if (!isISODate(input.periodStart)) {
    throw new Error(`Fecha inválida: ${input.periodStart} (se espera YYYY-MM-DD)`)
  }
  if (!isISODate(input.periodEnd)) {
    throw new Error(`Fecha inválida: ${input.periodEnd} (se espera YYYY-MM-DD)`)
  }
  if (input.periodEnd < input.periodStart) {
    throw new Error('El periodo no puede terminar antes de empezar')
  }
  // El check de la base exige que un diario tenga period_start = period_end;
  // se repite aquí para fallar con un mensaje claro en la app, en vez de un
  // error crudo de restricción si algo arma mal el periodo antes de llegar.
  if (input.tipo === 'diario' && input.periodStart !== input.periodEnd) {
    throw new Error('Un análisis diario debe tener el mismo inicio y fin de periodo')
  }
}

/** Guarda un análisis del mentor ya producido. */
export async function saveMentorAnalysis(input: MentorAnalysisInput): Promise<MentorAnalysis> {
  assertValidInput(input)

  const analysis: MentorAnalysis = {
    id: crypto.randomUUID(),
    tipo: input.tipo,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    tono: input.tono,
    incluyoDinero: input.incluyoDinero,
    contenido: input.contenido.trim(),
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase
      .from('mentor_analyses')
      .insert(mentorAnalysisToRow(analysis))
      .select(MENTOR_ANALYSIS_COLS),
    'saveMentorAnalysis',
  )
  return rowToMentorAnalysis(rows[0])
}

/**
 * Los últimos `limit` análisis de `tipo`, no archivados, del más reciente al
 * más antiguo. Es la consulta que soporta el índice
 * `(user_id, tipo, created_at desc)` de la tabla.
 */
export async function listMentorAnalyses(
  tipo: MentorAnalysisType,
  limit: number,
): Promise<MentorAnalysis[]> {
  const rows = unwrap(
    await supabase
      .from('mentor_analyses')
      .select(MENTOR_ANALYSIS_COLS)
      .eq('tipo', tipo)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(limit),
    'listMentorAnalyses',
  )
  return rows.map(rowToMentorAnalysis)
}

/** Archiva un análisis del mentor: sale del historial pero se conserva. Idempotente. */
export async function archiveMentorAnalysis(id: string): Promise<void> {
  const res = await supabase.from('mentor_analyses').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveMentorAnalysis: ${res.error.message}`)
}

// --- Resumen acumulado --------------------------------------------------

/** El resumen acumulado del usuario actual, o `undefined` si todavía no existe. */
export async function getMentorSummary(): Promise<MentorSummary | undefined> {
  const rows = unwrap(
    await supabase.from('mentor_summary').select(MENTOR_SUMMARY_COLS).limit(1),
    'getMentorSummary',
  )
  return rows[0] ? rowToMentorSummary(rows[0]) : undefined
}

/**
 * Escribe el resumen acumulado: lo crea si todavía no existe, o lo
 * reescribe si ya existe. `mentor_summary` tiene `unique(user_id)` -- solo
 * puede haber una fila por usuario -- así que esto es un insertar-o-
 * actualizar, nunca un `insert` a secas: el primer resumen funcionaría pero
 * el segundo fallaría contra esa restricción única.
 *
 * Al reescribir, el contenido actual pasa a `previous_contenido` antes de
 * sobrescribirse -- la red de un paso contra una reescritura peor que la
 * anterior (ver el comentario en `MentorSummary`, en `./types`).
 */
export async function saveMentorSummary(contenido: string): Promise<MentorSummary> {
  const clean = contenido.trim()
  if (!clean) throw new Error('El resumen no puede estar vacío')

  const existing = await getMentorSummary()

  if (existing) {
    const rows = unwrap(
      await supabase
        .from('mentor_summary')
        .update({ contenido: clean, previous_contenido: existing.contenido })
        .eq('id', existing.id)
        .select(MENTOR_SUMMARY_COLS),
      'saveMentorSummary',
    )
    return rowToMentorSummary(rows[0])
  }

  const rows = unwrap(
    await supabase
      .from('mentor_summary')
      .insert({ id: crypto.randomUUID(), contenido: clean })
      .select(MENTOR_SUMMARY_COLS),
    'saveMentorSummary',
  )
  return rowToMentorSummary(rows[0])
}
