/**
 * El módulo de datos de ideas, contra Supabase.
 *
 * Un solo campo de texto libre por idea, cuatro estados y archivado
 * (distinto de "descartada" -- pero no de "hecha": marcar una idea como
 * hecha también la archiva, igual que el archivado manual; volver de
 * 'hecha' a un estado abierto la desarchiva. Ver `setIdeaStatus`).
 * Lecturas y escrituras `async`, como los demás módulos.
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

/**
 * Las ideas archivadas, de la más reciente a la más antigua: incluye tanto
 * las archivadas a mano como las marcadas como 'hecha' (que se archivan
 * solas). Es el único sitio desde donde se pueden consultar y, si están
 * 'hecha', volver atrás.
 */
export async function listArchivedIdeas(): Promise<Idea[]> {
  const rows = unwrap(
    await supabase
      .from('ideas')
      .select(IDEA_COLS)
      .eq('archived', true)
      .order('created_at', { ascending: false }),
    'listArchivedIdeas',
  )
  return rows.map(rowToIdea)
}

/**
 * Todas las ideas cerradas (con `closedAt` fijado), sin importar si quedaron
 * archivadas. Alimenta el análisis semanal, que filtra por fecha local sobre
 * `closedAt` -- aquí no se filtra por fecha para no repetir esa lógica de
 * zona horaria en dos sitios.
 */
export async function listClosedIdeas(): Promise<Idea[]> {
  const rows = unwrap(
    await supabase
      .from('ideas')
      .select(IDEA_COLS)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false }),
    'listClosedIdeas',
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
    closedAt: null,
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

/**
 * Fija el estado de una idea (pendiente / en marcha / descartada / hecha).
 *
 * Cerrar (pasar a 'descartada' o a 'hecha') fija `closed_at`; volver a abrir
 * (pasar a 'pendiente' o a 'en-marcha') lo vuelve a poner en `null`.
 * Además, 'hecha' es el único estado que archiva: entrar en 'hecha' pone
 * `archived = true`, igual que el botón de archivar; salir de 'hecha' hacia
 * cualquier otro estado lo desarchiva. 'descartada' nunca toca `archived` --
 * sigue siendo una acción manual aparte, como siempre.
 */
export async function setIdeaStatus(id: string, status: IdeaStatus): Promise<void> {
  const rows = unwrap(
    await supabase.from('ideas').select('status,archived').eq('id', id),
    'setIdeaStatus',
  )
  const current = rows[0] as { status: IdeaStatus; archived: boolean } | undefined
  if (!current) throw new Error(`No existe la idea ${id}`)

  const closing = status === 'hecha' || status === 'descartada'
  const update: { status: IdeaStatus; closed_at: string | null; archived?: boolean } = {
    status,
    closed_at: closing ? new Date().toISOString() : null,
  }
  if (status === 'hecha') {
    update.archived = true
  } else if (current.status === 'hecha') {
    update.archived = false
  }

  const res = await supabase.from('ideas').update(update).eq('id', id)
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
