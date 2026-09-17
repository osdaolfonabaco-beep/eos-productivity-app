/**
 * El "para qué" del mentor: qué está intentando lograr el usuario, en qué
 * plazo, y qué le está costando. Lo escribe el usuario, no el mentor -- a
 * diferencia de `mentor_summary`, que sí lo reescribe el mentor con cada
 * análisis. Por eso este módulo es independiente de `./mentor`: distinto
 * dueño de la escritura, distinta frecuencia (aquí no la toca nadie salvo
 * cuando el usuario abre el formulario), y sin la red de un paso
 * (`previous_contenido`) que sí tiene el resumen, porque aquí no hay
 * ninguna IA reescribiendo que pueda salir mal.
 *
 * Una sola fila por usuario, que se reescribe (`unique(user_id)` en la
 * base) -- mismo patrón de insertar-o-actualizar que `saveMentorSummary`
 * en `./mentor`.
 */

import { MENTOR_PURPOSE_COLS, rowToMentorPurpose } from './rows'
import { supabase, unwrap } from './supabase'
import type { MentorPurpose } from './types'

/** Topes de longitud, iguales a los `check` de `supabase/mentor-purpose.sql`. Reusado por el formulario para el contador de caracteres. */
export const MENTOR_PURPOSE_LIMITS = {
  objetivo: 1200,
  plazo: 200,
  dificultad: 800,
} as const

/** Más de este número de días sin confirmar vigencia, se avisa en la pantalla y se lo decimos al mentor. */
const STALE_DAYS = 30

/** Lo que llega del formulario: los tres campos, tal cual los escribió el usuario (sin recortar todavía). */
export interface MentorPurposeInput {
  objetivo: string
  plazo: string
  dificultad: string
}

/** El propósito del usuario actual, o `undefined` si todavía no ha escrito ninguno. */
export async function getMentorPurpose(): Promise<MentorPurpose | undefined> {
  const rows = unwrap(
    await supabase.from('mentor_purpose').select(MENTOR_PURPOSE_COLS).limit(1),
    'getMentorPurpose',
  )
  return rows[0] ? rowToMentorPurpose(rows[0]) : undefined
}

/** Borra el propósito. Es el único borrado real de toda la app -- ver el comentario en `MentorPurposeSection`. */
export async function deleteMentorPurpose(id: string): Promise<void> {
  const res = await supabase.from('mentor_purpose').delete().eq('id', id)
  if (res.error) throw new Error(`deleteMentorPurpose: ${res.error.message}`)
}

/** `null` si `raw` recortado queda vacío; si no, el texto recortado. */
function cleanOrNull(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

/**
 * Valida un campo ya normalizado (`null` o con contenido) contra su tope.
 * Los topes ya los exige el `check` de la base; esto es para que la app
 * falle antes, con un mensaje legible, en vez de un error crudo de
 * restricción -- mismo criterio que `assertValidInput` en `./mentor`.
 */
function assertWithinLimit(value: string | null, field: keyof typeof MENTOR_PURPOSE_LIMITS, label: string): void {
  const limit = MENTOR_PURPOSE_LIMITS[field]
  if (value !== null && value.length > limit) {
    throw new Error(`${label} no puede superar los ${limit} caracteres.`)
  }
}

/**
 * Guarda el propósito: inserta si no existía, actualiza si ya existía
 * (mismo patrón que `saveMentorSummary`), y pone `reviewed_at` a ahora --
 * escribirlo es, por definición, confirmar que está vigente ahora mismo.
 *
 * Si los tres campos quedan vacíos tras recortar, la fila se BORRA en vez
 * de quedar con los tres en `null`: una fila así sería peor que no tener
 * fila (obligaría a mirar el contenido, no la existencia, para saber si
 * hay un propósito escrito, y el aviso de "más de un mes sin revisarse"
 * avisaría sobre un propósito que en realidad no existe -- ver el
 * comentario de cabecera de `supabase/mentor-purpose.sql`).
 */
export async function saveMentorPurpose(input: MentorPurposeInput): Promise<MentorPurpose | undefined> {
  const objetivo = cleanOrNull(input.objetivo)
  const plazo = cleanOrNull(input.plazo)
  const dificultad = cleanOrNull(input.dificultad)

  assertWithinLimit(objetivo, 'objetivo', 'El objetivo')
  assertWithinLimit(plazo, 'plazo', 'El plazo')
  assertWithinLimit(dificultad, 'dificultad', 'La dificultad')

  const existing = await getMentorPurpose()

  if (objetivo === null && plazo === null && dificultad === null) {
    if (existing) await deleteMentorPurpose(existing.id)
    return undefined
  }

  if (existing) {
    const rows = unwrap(
      await supabase
        .from('mentor_purpose')
        .update({ objetivo, plazo, dificultad, reviewed_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select(MENTOR_PURPOSE_COLS),
      'saveMentorPurpose',
    )
    return rowToMentorPurpose(rows[0])
  }

  const rows = unwrap(
    await supabase
      .from('mentor_purpose')
      .insert({ id: crypto.randomUUID(), objetivo, plazo, dificultad })
      .select(MENTOR_PURPOSE_COLS),
    'saveMentorPurpose',
  )
  return rowToMentorPurpose(rows[0])
}

/** Confirma que el propósito sigue vigente SIN tocar el texto: solo pone `reviewed_at` a ahora. */
export async function confirmMentorPurposeReviewed(id: string): Promise<MentorPurpose> {
  const rows = unwrap(
    await supabase
      .from('mentor_purpose')
      .update({ reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select(MENTOR_PURPOSE_COLS),
    'confirmMentorPurposeReviewed',
  )
  return rowToMentorPurpose(rows[0])
}

/**
 * `true` si lleva más de `STALE_DAYS` días sin confirmarse vigente.
 * `reviewedAt` es un instante real (timestamptz), no una fecha de
 * calendario `YYYY-MM-DD` como el resto de la app -- por eso la resta
 * directa de `Date` aquí es correcta y no tiene el problema de zona
 * horaria que si tendría con fechas locales (ver `./dates`).
 */
export function isMentorPurposeStale(purpose: MentorPurpose): boolean {
  const ms = Date.now() - new Date(purpose.reviewedAt).getTime()
  return ms > STALE_DAYS * 24 * 60 * 60 * 1000
}
