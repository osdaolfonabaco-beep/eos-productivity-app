/**
 * Preferencias del usuario. Se guardan en `user_metadata` (Supabase Auth), no
 * en una tabla propia: es exactamente para esto, y el permiso de leer/editar
 * tu propio `user_metadata` ya lo controla la API de Auth, no una policy
 * nuestra. `useSession()` se entera sola del cambio: `updateUser` dispara el
 * mismo evento que ya escucha.
 */

import { supabase } from './supabase'

export type Tone = 'directo' | 'equilibrado' | 'breve'

const DEFAULT_TONE: Tone = 'equilibrado'

function isTone(value: unknown): value is Tone {
  return value === 'directo' || value === 'equilibrado' || value === 'breve'
}

/** El tono guardado, o "equilibrado" si no hay nada o el valor no es válido. */
export async function getTone(): Promise<Tone> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`getTone: ${error.message}`)
  const value = data.user?.user_metadata?.tono
  return isTone(value) ? value : DEFAULT_TONE
}

/** Guarda el tono elegido para el análisis. */
export async function setTone(tone: Tone): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { tono: tone } })
  if (error) throw new Error(`setTone: ${error.message}`)
}
