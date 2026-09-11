/**
 * Pide un análisis breve de hábitos y tareas a la Edge Function `analyze`,
 * que lo manda a Gemini. El payload se arma aquí, con lo mínimo necesario:
 * nombres de hábito y su patrón de los últimos 14 días, y el texto de las
 * tareas de hoy y las atrasadas. El journal nunca entra en este archivo, así
 * que estructuralmente no hay forma de que se cuele en el análisis.
 */

import { addDays, todayISO } from './dates'
import { getEntriesInRange, listHabits } from './store'
import { supabase } from './supabase'
import { bucketTasks, listTasks } from './tasks'

const DAYS_BACK = 14

interface HabitSummary {
  nombre: string
  ultimos14dias: string
}

interface TaskSummary {
  texto: string
  hecha?: boolean
  diasDeAtraso?: number
}

interface AnalysisPayload {
  hoy: string
  habitos: HabitSummary[]
  tareas: {
    hoy: TaskSummary[]
    atrasadas: TaskSummary[]
  }
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
    const perDay = byHabit.get(h.id)
    const code = days
      .map((d) => {
        const done = perDay?.get(d)
        return done === undefined ? '.' : done ? 'H' : 'N'
      })
      .join('')
    return { nombre: h.name, ultimos14dias: code }
  })
}

async function buildTasksSummary(today: string): Promise<AnalysisPayload['tareas']> {
  const tasks = await listTasks()
  const { hoy, atrasadas } = bucketTasks(tasks, today)
  return {
    hoy: hoy.map((t) => ({ texto: t.text, hecha: t.done })),
    atrasadas: atrasadas.map((t) => ({
      texto: t.text,
      diasDeAtraso: daysBetween(t.date ?? today, today),
    })),
  }
}

/** Intenta sacar el mensaje de error que puso la función, si lo hay. */
async function extractFunctionError(error: { context?: unknown }): Promise<string | undefined> {
  const context = error.context
  if (!(context instanceof Response)) return undefined
  try {
    const body: unknown = await context.clone().json()
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error
    }
  } catch {
    /* el cuerpo no era JSON con "error"; se usa el mensaje genérico */
  }
  return undefined
}

/** Pide el análisis. No guarda nada: el texto vive solo en el estado de quien lo pidió. */
export async function requestAnalysis(): Promise<string> {
  const today = todayISO()
  const [habitos, tareas] = await Promise.all([
    buildHabitsSummary(today),
    buildTasksSummary(today),
  ])

  const payload: AnalysisPayload = { hoy: today, habitos, tareas }

  const { data, error } = await supabase.functions.invoke<{ analysis?: string; error?: string }>(
    'analyze',
    { body: payload },
  )

  if (error) {
    const detail = await extractFunctionError(error)
    throw new Error(detail ?? error.message)
  }
  if (!data?.analysis) {
    throw new Error(data?.error ?? 'No se pudo obtener el análisis.')
  }
  return data.analysis
}
