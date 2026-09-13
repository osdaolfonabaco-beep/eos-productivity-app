/**
 * Acceso a la fila de cifrado del diario (`journal_key`): una por usuario.
 * Ningún componente toca Supabase directamente; todo pasa por aquí.
 *
 * Este módulo no cifra ni descifra nada — eso es `src/lib/journalCrypto.ts`,
 * que es puro y no conoce Supabase. Aquí solo se lee y se escribe la fila.
 */

import type { JournalKeyWrapping, PasswordWrapping } from '../lib/journalCrypto'
import { JOURNAL_KEY_COLS, journalKeyWrappingToRow, rowToJournalKey } from './rows'
import { supabase, unwrap } from './supabase'
import type { JournalKey } from './types'

/** La fila de cifrado del usuario actual, o `undefined` si todavía no la creó. */
export async function getJournalKey(): Promise<JournalKey | undefined> {
  const rows = unwrap(
    await supabase.from('journal_key').select(JOURNAL_KEY_COLS).limit(1),
    'getJournalKey',
  )
  return rows[0] ? rowToJournalKey(rows[0]) : undefined
}

/** Crea la fila de cifrado del usuario actual. Falla si ya existía una (solo hay una por usuario). */
export async function insertJournalKey(wrapping: JournalKeyWrapping): Promise<JournalKey> {
  const row = { id: crypto.randomUUID(), ...journalKeyWrappingToRow(wrapping) }
  const rows = unwrap(
    await supabase.from('journal_key').insert(row).select(JOURNAL_KEY_COLS),
    'insertJournalKey',
  )
  return rowToJournalKey(rows[0])
}

/** Reemplaza solo la envoltura de contraseña (cambio de contraseña). No toca la de recuperación. */
export async function updatePasswordWrapping(id: string, wrapping: PasswordWrapping): Promise<JournalKey> {
  const rows = unwrap(
    await supabase
      .from('journal_key')
      .update({
        wrapped_dek_password: wrapping.wrappedDekPassword,
        salt_password: wrapping.saltPassword,
        iv_password: wrapping.ivPassword,
      })
      .eq('id', id)
      .select(JOURNAL_KEY_COLS),
    'updatePasswordWrapping',
  )
  if (!rows[0]) throw new Error(`updatePasswordWrapping: no existe la fila ${id}`)
  return rowToJournalKey(rows[0])
}
