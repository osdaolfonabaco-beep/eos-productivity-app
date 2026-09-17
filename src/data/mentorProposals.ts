/**
 * Las propuestas de mejora del mentor: al final de cada análisis SEMANAL
 * (`requestWeeklyAnalysis`, en `./analysis`), el mentor propone UNA cosa
 * sobre hábitos, tareas o rutinas -- nunca sobre dinero. El usuario la
 * acepta o la descarta; si la acepta, queda activa dos semanas y al vencer
 * se cierra diciendo si funcionó, si sigue en ello, o si se descartó.
 *
 * Solo puede haber una propuesta ACTIVA (`status` 'propuesta' o 'aceptada',
 * no archivada) a la vez -- índice único parcial en la base
 * (`mentor_proposals_one_active_idx`, ver `supabase/mentor-proposals.sql`).
 * `createMentorProposal` comprueba esto ANTES de insertar y falla con un
 * mensaje legible, mismo criterio que `assertValidInput` en `./mentor`: la
 * restricción de la base es la última línea de defensa, no la primera.
 */

import { addDays, todayISO } from './dates'
import { MENTOR_PROPOSAL_COLS, rowToMentorProposal } from './rows'
import { supabase, unwrap } from './supabase'
import type { MentorProposal, MentorProposalResult } from './types'

/**
 * Días que dura una propuesta aceptada, y también el margen de gracia del
 * cierre automático (ver `autoCloseExpiredMentorProposals`, más abajo):
 * misma duración, mismo nombre, para que quede claro que es la misma regla
 * de negocio aplicada dos veces, no dos números que coincidan por
 * casualidad.
 */
const PROPOSAL_ACTIVE_DAYS = 14

/** Cuántas propuestas inactivas trae el historial (pantalla + prompt de "no repitas la misma idea"). */
const DEFAULT_HISTORY_LIMIT = 10

/** La propuesta activa del usuario actual (`status` 'propuesta' o 'aceptada'), o `undefined` si no hay ninguna. */
export async function getActiveMentorProposal(): Promise<MentorProposal | undefined> {
  const rows = unwrap(
    await supabase
      .from('mentor_proposals')
      .select(MENTOR_PROPOSAL_COLS)
      .in('status', ['propuesta', 'aceptada'])
      .eq('archived', false)
      .limit(1),
    'getActiveMentorProposal',
  )
  return rows[0] ? rowToMentorProposal(rows[0]) : undefined
}

/**
 * Crea una propuesta nueva, en estado 'propuesta'. Comprueba que no haya ya
 * una activa ANTES de insertar -- el índice único de la base la rechazaría
 * igual, pero con un error crudo de restricción en vez de este mensaje.
 */
export async function createMentorProposal(input: {
  contenido: string
  analisisId?: string
}): Promise<MentorProposal> {
  const contenido = input.contenido.trim()
  if (!contenido) throw new Error('La propuesta no puede estar vacía.')

  const active = await getActiveMentorProposal()
  if (active) {
    throw new Error('Ya hay una propuesta activa: no se puede crear otra hasta que se descarte o se cierre.')
  }

  const rows = unwrap(
    await supabase
      .from('mentor_proposals')
      .insert({
        id: crypto.randomUUID(),
        contenido,
        analisis_id: input.analisisId ?? null,
      })
      .select(MENTOR_PROPOSAL_COLS),
    'createMentorProposal',
  )
  return rowToMentorProposal(rows[0])
}

/** Acepta una propuesta: queda activa `PROPOSAL_ACTIVE_DAYS` días desde hoy. */
export async function acceptMentorProposal(id: string): Promise<MentorProposal> {
  const today = todayISO()
  const rows = unwrap(
    await supabase
      .from('mentor_proposals')
      .update({
        status: 'aceptada',
        aceptada_en: new Date().toISOString(),
        vence_en: addDays(today, PROPOSAL_ACTIVE_DAYS),
      })
      .eq('id', id)
      .select(MENTOR_PROPOSAL_COLS),
    'acceptMentorProposal',
  )
  return rowToMentorProposal(rows[0])
}

/** Descarta una propuesta sin aceptarla nunca. Terminal, sin confirmación en la interfaz: no destruye nada, solo cambia de estado. */
export async function discardMentorProposal(id: string): Promise<void> {
  const res = await supabase.from('mentor_proposals').update({ status: 'descartada' }).eq('id', id)
  if (res.error) throw new Error(`discardMentorProposal: ${res.error.message}`)
}

/** Cierra una propuesta aceptada, diciendo cómo terminó. */
export async function closeMentorProposal(
  id: string,
  resultado: MentorProposalResult,
): Promise<MentorProposal> {
  const rows = unwrap(
    await supabase
      .from('mentor_proposals')
      .update({ status: 'cerrada', resultado, cerrada_en: new Date().toISOString() })
      .eq('id', id)
      .select(MENTOR_PROPOSAL_COLS),
    'closeMentorProposal',
  )
  return rowToMentorProposal(rows[0])
}

/**
 * Las últimas propuestas que ya no están activas (`status` 'descartada' o
 * 'cerrada'), del más reciente al más antiguo. Sirve DOS usos: el historial
 * plegado en la pantalla, y el "no repitas la misma idea" del payload de
 * `requestWeeklyAnalysis` (ver `./analysis`) -- mismo dato, dos lectores.
 */
export async function listRecentInactiveMentorProposals(
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<MentorProposal[]> {
  const rows = unwrap(
    await supabase
      .from('mentor_proposals')
      .select(MENTOR_PROPOSAL_COLS)
      .in('status', ['descartada', 'cerrada'])
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(limit),
    'listRecentInactiveMentorProposals',
  )
  return rows.map(rowToMentorProposal)
}

/**
 * Cierra sola cualquier propuesta 'aceptada' cuyo `vence_en` pasó hace más
 * de `PROPOSAL_ACTIVE_DAYS` días más (el margen de gracia), con resultado
 * 'descartada' -- para que una propuesta olvidada no bloquee el índice único
 * para siempre si el usuario no vuelve a abrir la app. Ver el comentario
 * grande en `supabase/mentor-proposals.sql`. Se llama al cargar
 * `MentorProposalSection`, antes de leer la propuesta activa.
 */
export async function autoCloseExpiredMentorProposals(): Promise<void> {
  const threshold = addDays(todayISO(), -PROPOSAL_ACTIVE_DAYS)
  const res = await supabase
    .from('mentor_proposals')
    .update({ status: 'cerrada', resultado: 'descartada', cerrada_en: new Date().toISOString() })
    .eq('status', 'aceptada')
    .eq('archived', false)
    .lt('vence_en', threshold)
  if (res.error) throw new Error(`autoCloseExpiredMentorProposals: ${res.error.message}`)
}
