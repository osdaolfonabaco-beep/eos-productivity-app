/**
 * Pide un análisis breve de hábitos y tareas a la Edge Function `analyze`,
 * que lo manda a Gemini. El payload se arma aquí, con lo mínimo necesario:
 * nombres de hábito, su patrón de los últimos 14 días y desde cuándo existen
 * (para no evaluar como incumplimiento días previos a su creación), y las
 * tareas de hoy (separadas en hechas/sin hacer) y las atrasadas de días
 * anteriores, cada grupo en su propio campo con nombre explícito — para que
 * no haya que inferir de un booleano o de una clave "hoy" repetida qué es
 * cada cosa. También el tono elegido en Ajustes (`getTone`), para que la
 * función sepa qué instrucción de tono usar.
 * El journal nunca entra en este archivo, así que estructuralmente no hay
 * forma de que se cuele en el análisis.
 */

import { addDays, toISODate, todayISO } from './dates'
import { getTone, type Tone } from './preferences'
import { getEntriesInRange, listHabits } from './store'
import { supabase } from './supabase'
import { bucketTasks, listTasks } from './tasks'

const DAYS_BACK = 14

interface HabitSummary {
  nombre: string
  /** Cada carácter es un día: H/N/. como antes, o "_" si el hábito no existía ese día. */
  ultimos14dias: string
  /** Fecha local (YYYY-MM-DD) en que se creó el hábito. */
  creadoEl: string
  /** Días de historial real dentro de la ventana, ya calculados (máx. 14). */
  diasConHistorial: number
}

interface TaskItem {
  texto: string
}

interface OverdueTaskItem {
  texto: string
  diasDeAtraso: number
}

/**
 * Nombres deliberadamente explícitos y sin solapar: antes había un "hoy" a
 * nivel raíz (la fecha) y otro "hoy" dentro de "tareas" (una lista), y el
 * modelo llegó a confundir tareas de hoy sin hacer con atrasadas. Debe
 * coincidir con `AnalysisPayload` de `supabase/functions/analyze/index.ts`.
 */
interface AnalysisPayload {
  fechaDeHoy: string
  habitos: HabitSummary[]
  tareasDeHoySinHacer: TaskItem[]
  tareasDeHoyHechas: TaskItem[]
  tareasAtrasadasDeDiasAnteriores: OverdueTaskItem[]
  /** Se manda calculado para que el modelo no tenga que contar la lista él mismo. */
  totalTareasAtrasadas: number
  /** El tono elegido en Ajustes; decide qué instrucción usa la función. */
  tono: Tone
}

/** Diferencia en días de calendario entre dos fechas `YYYY-MM-DD` (`to` - `from`). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

async function buildHabitsSummary(today: string): Promise<HabitSummary[]> {
  const habits = await listHabits()
  if (habits.length === 0) return []

  const start = addDays(today, -(DAYS_BACK - 1))
  const entries = await getEntriesInRange(start, today)

  const byHabit = new Map<string, Map<string, boolean>>()
  for (const e of entries) {
    let perDay = byHabit.get(e.habitId)
    if (!perDay) {
      perDay = new Map()
      byHabit.set(e.habitId, perDay)
    }
    perDay.set(e.date, e.done)
  }

  const days = Array.from({ length: DAYS_BACK }, (_, i) => addDays(start, i))

  return habits.map((h) => {
    // Local, no la fecha UTC cruda de createdAt: mismo criterio que todayISO().
    const createdDate = toISODate(new Date(h.createdAt))
    const perDay = byHabit.get(h.id)
    const code = days
      .map((d) => {
        if (d < createdDate) return '_' // el hábito todavía no existía ese día
        const done = perDay?.get(d)
        return done === undefined ? '.' : done ? 'H' : 'N'
      })
      .join('')
    const diasConHistorial = Math.min(DAYS_BACK, Math.max(0, daysBetween(createdDate, today) + 1))
    return { nombre: h.name, ultimos14dias: code, creadoEl: createdDate, diasConHistorial }
  })
}

type TasksSummary = Omit<AnalysisPayload, 'fechaDeHoy' | 'habitos' | 'tono'>

async function buildTasksSummary(today: string): Promise<TasksSummary> {
  const tasks = await listTasks()
  const { hoy, atrasadas } = bucketTasks(tasks, today)
  return {
    tareasDeHoySinHacer: hoy.filter((t) => !t.done).map((t) => ({ texto: t.text })),
    tareasDeHoyHechas: hoy.filter((t) => t.done).map((t) => ({ texto: t.text })),
    tareasAtrasadasDeDiasAnteriores: atrasadas.map((t) => ({
      texto: t.text,
      diasDeAtraso: daysBetween(t.date ?? today, today),
    })),
    totalTareasAtrasadas: atrasadas.length,
  }
}

/**
 * Mensaje a partir del cuerpo de error de la función. Si es saturación de
 * Gemini (`code: 'overloaded'`), un mensaje entendible y nada más — el
 * detalle técnico no ayuda ahí y solo confunde. Para cualquier otro error,
 * "error" + "detail" completos, como antes.
 */
function messageFromBody(body: Record<string, unknown>): string | undefined {
  if (body.code === 'overloaded' && typeof body.error === 'string') {
    return body.error
  }
  const parts: string[] = []
  if (typeof body.error === 'string') parts.push(body.error)
  if (typeof body.detail === 'string' && body.detail) parts.push(body.detail)
  return parts.length ? parts.join(' — ') : undefined
}

/** Saca el mensaje de error que puso la función, si lo hay, sin tener que ir a los logs. */
async function extractFunctionError(error: { context?: unknown }): Promise<string | undefined> {
  const context = error.context
  if (!(context instanceof Response)) return undefined
  try {
    const body = (await context.clone().json()) as Record<string, unknown>
    return messageFromBody(body)
  } catch {
    /* el cuerpo no era JSON; se usa el mensaje genérico */
    return undefined
  }
}

/** Pide el análisis. No guarda nada: el texto vive solo en el estado de quien lo pidió. */
export async function requestAnalysis(): Promise<string> {
  const today = todayISO()
  const [habitos, tareas, tono] = await Promise.all([
    buildHabitsSummary(today),
    buildTasksSummary(today),
    getTone(),
  ])

  const payload: AnalysisPayload = { fechaDeHoy: today, habitos, ...tareas, tono }

  const { data, error } = await supabase.functions.invoke<{
    analysis?: string
    error?: string
    detail?: string
    code?: string
  }>('analyze', { body: payload })

  if (error) {
    const message = await extractFunctionError(error)
    throw new Error(message ?? error.message)
  }
  if (!data?.analysis) {
    throw new Error(messageFromBody(data ?? {}) ?? 'No se pudo obtener el análisis.')
  }
  return data.analysis
}
