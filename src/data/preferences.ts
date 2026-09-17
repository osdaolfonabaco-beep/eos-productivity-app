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

// --- El mentor y el dinero ------------------------------------------------

const DEFAULT_MENTOR_VE_DINERO = true

/**
 * Si el mentor ve los datos de dinero (sueldo, gastos por categoría,
 * disponible y deudas) en los análisis diario y semanal. Encendido por
 * defecto -- mismo criterio de "activo salvo que se apague" que el resto de
 * interruptores de la app. Mismo patrón que `getTone`: `user_metadata`, sin
 * tabla propia.
 */
export async function getMentorSeesMoney(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`getMentorSeesMoney: ${error.message}`)
  const value = data.user?.user_metadata?.mentorVeDinero
  return typeof value === 'boolean' ? value : DEFAULT_MENTOR_VE_DINERO
}

/** Guarda si el mentor ve los datos de dinero. */
export async function setMentorSeesMoney(value: boolean): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { mentorVeDinero: value } })
  if (error) throw new Error(`setMentorSeesMoney: ${error.message}`)
}

// --- Recordatorios diarios (dos, cada uno activable por separado) --------

/** Cuántos recordatorios independientes admite la app. */
export const REMINDER_SLOT_COUNT = 2

export interface ReminderTimes {
  /** Longitud fija `REMINDER_SLOT_COUNT`; cada posición es "HH:MM" o `null` (desactivado). */
  horarios: (string | null)[]
  /** Zona horaria IANA, compartida por los dos. `null` si ninguno se ha configurado nunca. */
  zonaHoraria: string | null
}

function isReminderTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** A longitud `REMINDER_SLOT_COUNT`, descartando lo que no sea una hora válida. */
function normalizeHorarios(value: unknown): (string | null)[] {
  const arr = Array.isArray(value) ? value : []
  return Array.from({ length: REMINDER_SLOT_COUNT }, (_, i) => {
    const v = arr[i]
    return typeof v === 'string' && isReminderTime(v) ? v : null
  })
}

/**
 * Los dos recordatorios y su zona horaria compartida.
 *
 * Migra sola, la primera vez que se llama tras esta versión, el valor único
 * de la versión anterior (`horaRecordatorio`) al primer recordatorio de la
 * lista nueva, y limpia esa clave vieja. El servidor (`send-reminders`) hace
 * la misma lectura de respaldo por su cuenta, para que un recordatorio ya
 * configurado no deje de sonar mientras nadie abre Ajustes para disparar
 * esta migración.
 */
export async function getReminderTimes(): Promise<ReminderTimes> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`getReminderTimes: ${error.message}`)
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
  const zonaHoraria = typeof meta.zonaHorariaRecordatorio === 'string' ? meta.zonaHorariaRecordatorio : null

  if (meta.horariosRecordatorio !== undefined) {
    return { horarios: normalizeHorarios(meta.horariosRecordatorio), zonaHoraria }
  }

  const oldHora = meta.horaRecordatorio
  if (typeof oldHora === 'string' && isReminderTime(oldHora)) {
    const horarios = normalizeHorarios([oldHora])
    // Reescritura de una sola vez a la forma nueva; se limpia la clave vieja
    // para no dejarla rondando con una forma que el resto del código ya no lee.
    await supabase.auth.updateUser({ data: { horariosRecordatorio: horarios, horaRecordatorio: null } })
    return { horarios, zonaHoraria }
  }

  return { horarios: normalizeHorarios(undefined), zonaHoraria }
}

/**
 * Guarda la hora de un recordatorio ("HH:MM", 24h, local), o `null` para
 * desactivar ese en concreto; el otro no se toca. La zona horaria (una sola,
 * compartida) se recaptura del navegador cada vez que se activa cualquiera
 * de los dos, no la elige quien usa la app: es lo que necesita el servidor
 * para saber a qué hora UTC corresponde cada hora local.
 */
export async function setReminderSlot(slot: number, hora: string | null): Promise<void> {
  if (hora !== null && !isReminderTime(hora)) {
    throw new Error('Hora inválida (se espera HH:MM)')
  }
  const current = await getReminderTimes()
  const horarios = [...current.horarios]
  horarios[slot] = hora

  const zonaHoraria =
    hora !== null ? Intl.DateTimeFormat().resolvedOptions().timeZone : current.zonaHoraria

  const { error } = await supabase.auth.updateUser({
    data: { horariosRecordatorio: horarios, zonaHorariaRecordatorio: zonaHoraria },
  })
  if (error) throw new Error(`setReminderSlot: ${error.message}`)
}
