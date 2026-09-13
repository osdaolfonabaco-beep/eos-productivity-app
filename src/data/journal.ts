/**
 * El módulo de datos del diario, contra Supabase.
 *
 * Varias notas pueden compartir un día; se numeran por orden de creación
 * ("Nota 1", "Nota 2"...) — no se guarda ningún número, es la posición al
 * ordenar por `created_at`. Solo la interfaz decide que las notas de hoy son
 * editables y las de antes no; la base de datos no lo impone. `promptForDate`
 * es pura: no toca la red ni se guarda en ningún sitio, solo decora la pantalla.
 *
 * Este módulo no cifra ni descifra nada: eso vive en `src/lib/journalCrypto.ts`,
 * que necesita la DEK (solo en memoria, en la interfaz) y por eso no puede
 * vivir aquí. `NoteContent` es la forma en que quien llama (con o sin DEK a
 * mano) entrega el contenido ya resuelto — en claro o ya cifrado.
 */

import { JOURNAL_COLS, journalNoteToRow, rowToJournalNote } from './rows'
import { supabase, unwrap } from './supabase'
import type { JournalNote } from './types'

/**
 * El contenido de una nota, listo para guardar. O bien `text` trae el texto en
 * claro y `encrypted` es `false`, o bien `ciphertext`/`iv` traen el resultado
 * de `encryptNote` y `encrypted` es `true` — nunca las dos cosas a la vez, y
 * si está cifrado `text` va en `null`: el texto en claro no debe llegar aquí.
 */
export interface NoteContent {
  text: string | null
  ciphertext: string | null
  iv: string | null
  encrypted: boolean
}

function assertValidContent(content: NoteContent): void {
  if (content.encrypted) {
    if (!content.ciphertext || !content.iv) {
      throw new Error('Nota cifrada incompleta: falta ciphertext o iv')
    }
  } else if (!content.text || !content.text.trim()) {
    throw new Error('La nota no puede estar vacía')
  }
}

/** Las notas de un día, de la más vieja a la más nueva (Nota 1, Nota 2...). */
export async function listTodayNotes(date: string): Promise<JournalNote[]> {
  const rows = unwrap(
    await supabase
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('date', date)
      .eq('archived', false)
      .order('created_at', { ascending: true }),
    'listTodayNotes',
  )
  return rows.map(rowToJournalNote)
}

/**
 * Todas las notas de días anteriores a `date`, sin agrupar por día.
 * Agrúpalas con `groupNotesByDate` antes de mostrarlas.
 */
export async function listNotesBefore(date: string): Promise<JournalNote[]> {
  const rows = unwrap(
    await supabase
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .lt('date', date)
      .eq('archived', false)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true }),
    'listNotesBefore',
  )
  return rows.map(rowToJournalNote)
}

/** Añade una nota nueva a un día. */
export async function createNote(date: string, content: NoteContent): Promise<JournalNote> {
  assertValidContent(content)

  const note: JournalNote = {
    id: crypto.randomUUID(),
    date,
    text: content.text,
    ciphertext: content.ciphertext,
    iv: content.iv,
    encrypted: content.encrypted,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('journal_entries').insert(journalNoteToRow(note)).select(JOURNAL_COLS),
    'createNote',
  )
  return rowToJournalNote(rows[0])
}

/**
 * Cambia el contenido de una nota. Pensada para las de hoy: las de días
 * anteriores son de solo lectura en la interfaz.
 */
export async function updateNoteContent(id: string, content: NoteContent): Promise<JournalNote> {
  assertValidContent(content)

  const rows = unwrap(
    await supabase
      .from('journal_entries')
      .update({
        text: content.text,
        ciphertext: content.ciphertext,
        iv: content.iv,
        encrypted: content.encrypted,
      })
      .eq('id', id)
      .select(JOURNAL_COLS),
    'updateNoteContent',
  )
  if (!rows[0]) throw new Error(`No existe la nota ${id}`)
  return rowToJournalNote(rows[0])
}

/** Archiva una nota: sale de la lista, el texto se conserva. Idempotente. */
export async function archiveNote(id: string): Promise<void> {
  const res = await supabase.from('journal_entries').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveNote: ${res.error.message}`)
}

// --- Agrupación (pura) ------------------------------------------------

export interface DayNotes {
  date: string
  notes: JournalNote[]
}

/**
 * Agrupa notas de días anteriores por fecha: del día más reciente al más
 * antiguo, y dentro de cada día de la nota más vieja a la más nueva. Pensada
 * para el resultado de `listNotesBefore`.
 */
export function groupNotesByDate(notes: JournalNote[]): DayNotes[] {
  const byDate = new Map<string, JournalNote[]>()
  for (const n of notes) {
    const group = byDate.get(n.date)
    if (group) group.push(n)
    else byDate.set(n.date, [n])
  }
  return [...byDate.entries()]
    .map(([date, dayNotes]) => ({ date, notes: dayNotes }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
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
