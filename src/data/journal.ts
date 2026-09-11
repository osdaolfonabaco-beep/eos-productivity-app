/**
 * El módulo de datos del diario, contra Supabase.
 *
 * Una entrada por día (`unique (user_id, date)`); escribir la de hoy es un
 * upsert. Solo la interfaz decide que las entradas pasadas no se editan — la
 * base de datos no lo impide. `promptForDate` es pura: no toca la red ni se
 * guarda en ningún sitio, solo decora la pantalla.
 */

import { JOURNAL_COLS, rowToJournalEntry } from './rows'
import { supabase, unwrap } from './supabase'
import type { JournalEntry } from './types'

/** La entrada de una fecha, o `undefined` si no hay. Ignora las archivadas. */
export async function getJournalEntry(date: string): Promise<JournalEntry | undefined> {
  const rows = unwrap(
    await supabase
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('date', date)
      .eq('archived', false)
      .limit(1),
    'getJournalEntry',
  )
  return rows[0] ? rowToJournalEntry(rows[0]) : undefined
}

/** Las entradas anteriores a `date` (sin incluirla), de la más reciente a la más antigua. */
export async function listJournalEntriesBefore(date: string): Promise<JournalEntry[]> {
  const rows = unwrap(
    await supabase
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .lt('date', date)
      .eq('archived', false)
      .order('date', { ascending: false }),
    'listJournalEntriesBefore',
  )
  return rows.map(rowToJournalEntry)
}

/**
 * Escribe la entrada de `date`: la crea si no existe, o reescribe su texto si
 * ya existe. Así es "editable durante ese día" — guardar de nuevo reemplaza.
 */
export async function saveJournalEntry(date: string, text: string): Promise<JournalEntry> {
  const clean = text.trim()
  if (!clean) throw new Error('La entrada no puede estar vacía')

  const rows = unwrap(
    await supabase
      .from('journal_entries')
      .upsert({ date, text: clean }, { onConflict: 'user_id,date' })
      .select(JOURNAL_COLS),
    'saveJournalEntry',
  )
  return rowToJournalEntry(rows[0])
}

/**
 * Archiva una entrada pasada: sale de la lista, el texto se conserva.
 * Idempotente.
 */
export async function archiveJournalEntry(id: string): Promise<void> {
  const res = await supabase.from('journal_entries').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveJournalEntry: ${res.error.message}`)
}

// --- Pregunta sugerida (pura, no se guarda) --------------------------

const PROMPTS = [
  '¿Qué fue lo mejor de hoy?',
  '¿Qué aprendiste hoy?',
  '¿Por qué estás agradecido hoy?',
  '¿Qué te costó trabajo hoy?',
  '¿Qué harías distinto si repitieras el día?',
  '¿Qué momento de hoy quieres recordar?',
  '¿Qué te preocupa ahora mismo?',
  '¿Qué avanzaste hoy, aunque sea poco?',
  '¿Quién te hizo bien hoy?',
  '¿Qué te gustaría lograr mañana?',
  '¿Qué idea no se te ha ido de la cabeza hoy?',
  '¿Qué necesitas soltar antes de dormir?',
  '¿En qué momento de hoy te sentiste más tú?',
  '¿Qué evitaste hoy que no deberías seguir evitando?',
  '¿Qué te hizo reír hoy?',
  '¿Qué harías si tuvieras una hora libre ahora mismo?',
  '¿Qué decisión de hoy te costó más de lo esperado?',
  '¿A quién le debes una conversación pendiente?',
  '¿Qué parte del día de hoy repetirías mañana?',
  '¿Qué te dirías a ti mismo si te vieras desde fuera hoy?',
] as const

/**
 * Una pregunta a partir de la fecha: la misma fecha siempre da la misma
 * pregunta (si abres la app varias veces el mismo día, no cambia), y suele
 * variar de un día a otro. Hash simple sobre el texto YYYY-MM-DD; nada de
 * objetos Date ni de IA.
 */
export function promptForDate(date: string): string {
  let hash = 0
  for (let i = 0; i < date.length; i++) {
    hash = (hash * 31 + date.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % PROMPTS.length
  return PROMPTS[index]
}
