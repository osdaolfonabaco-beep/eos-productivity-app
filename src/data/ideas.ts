/**
 * El módulo de datos de ideas, contra Supabase.
 *
 * Un solo campo de texto libre por idea, tres estados y archivado (distinto de
 * "descartada"). Lecturas y escrituras `async`, como los demás módulos.
 */

import { IDEA_COLS, ideaToRow, rowToIdea } from './rows'
import { supabase, unwrap } from './supabase'
import type { Idea, IdeaStatus } from './types'

/** Las ideas no archivadas, de la más reciente a la más antigua. */
export async function listIdeas(): Promise<Idea[]> {
  const rows = unwrap(
    await supabase
      .from('ideas')
      .select(IDEA_COLS)
      .eq('archived', false)
      .order('created_at', { ascending: false }),
    'listIdeas',
  )
  return rows.map(rowToIdea)
}

/** Anota una idea. `text` se recorta; si queda vacío, lanza error. */
export async function createIdea(text: string): Promise<Idea> {
  const clean = text.trim()
  if (!clean) throw new Error('La idea no puede estar vacía')

  const idea: Idea = {
    id: crypto.randomUUID(),
    text: clean,
    status: 'pendiente',
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('ideas').insert(ideaToRow(idea)).select(IDEA_COLS),
    'createIdea',
  )
  return rowToIdea(rows[0])
}

/** Cambia el texto de una idea. */
export async function updateIdeaText(id: string, text: string): Promise<Idea> {
  const clean = text.trim()
  if (!clean) throw new Error('La idea no puede estar vacía')

  const rows = unwrap(
    await supabase.from('ideas').update({ text: clean }).eq('id', id).select(IDEA_COLS),
    'updateIdeaText',
  )
  if (!rows[0]) throw new Error(`No existe la idea ${id}`)
  return rowToIdea(rows[0])
}

/** Fija el estado de una idea (pendiente / en marcha / descartada). */
export async function setIdeaStatus(id: string, status: IdeaStatus): Promise<void> {
  const res = await supabase.from('ideas').update({ status }).eq('id', id)
  if (res.error) throw new Error(`setIdeaStatus: ${res.error.message}`)
}

/**
 * Archiva una idea: sale de la lista pero se conserva. Distinto de "descartada",
 * que es un estado y sigue a la vista. Idempotente.
 */
export async function archiveIdea(id: string): Promise<void> {
  const res = await supabase.from('ideas').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveIdea: ${res.error.message}`)
}
