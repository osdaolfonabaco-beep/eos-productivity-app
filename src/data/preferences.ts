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

// --- Recordatorio diario (primer paso: solo la preferencia, sin notificar) --

export interface ReminderTime {
  /** "HH:MM", 24 horas, hora local. */
  hora: string
  /** Zona horaria IANA capturada del navegador al guardar, p. ej. "America/Bogota". */
  zonaHoraria: string
}

function isReminderTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** El recordatorio guardado, o `null` si está desactivado o no se ha configurado. */
export async function getReminderTime(): Promise<ReminderTime | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`getReminderTime: ${error.message}`)
  const meta = data.user?.user_metadata as Record<string, unknown> | undefined
  const hora = meta?.horaRecordatorio
  const zonaHoraria = meta?.zonaHorariaRecordatorio
  if (typeof hora === 'string' && isReminderTime(hora) && typeof zonaHoraria === 'string') {
    return { hora, zonaHoraria }
  }
  return null
}

/**
 * Guarda la hora del recordatorio ("HH:MM", 24h, local), o `null` para
 * desactivarlo. La zona horaria se captura sola del navegador, no la elige
 * quien usa la app: para eso está aquí, para que la futura tarea programada
 * sepa a qué hora UTC corresponde tu hora local.
 */
export async function setReminderTime(hora: string | null): Promise<void> {
  if (hora !== null && !isReminderTime(hora)) {
    throw new Error('Hora inválida (se espera HH:MM)')
  }
  const zonaHoraria = hora === null ? null : Intl.DateTimeFormat().resolvedOptions().timeZone
  const { error } = await supabase.auth.updateUser({
    data: { horaRecordatorio: hora, zonaHorariaRecordatorio: zonaHoraria },
  })
  if (error) throw new Error(`setReminderTime: ${error.message}`)
}
