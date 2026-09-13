/**
 * Pide un análisis a la Edge Function `analyze`, que lo manda a Gemini. Tres
 * variantes, discriminadas por "tipo" en el payload (debe coincidir con
 * `supabase/functions/analyze/index.ts`, que sirve las tres):
 *
 * - `requestAnalysis` (diario): nombres de hábito, su patrón de los últimos
 *   14 días y desde cuándo existen (para no evaluar como incumplimiento días
 *   previos a su creación), y las tareas de hoy (separadas en hechas/sin
 *   hacer) y las atrasadas de días anteriores.
 * - `requestWeeklyAnalysis` (semanal): el desglose de `./weeklyStats` y las
 *   metas de la semana con sus avances (`./goals`), para el dashboard de
 *   Vida -> Semana. También la semana anterior de ambos, para comparar.
 * - `requestIdeaAnalysis` (idea): una sola idea de la pestaña Ideas, con
 *   nada más que su texto y su estado — a propósito no lleva ni la lista de
 *   ideas ni ningún otro dato de la cuenta.
 *
 * Los payloads usan campos explícitos y sin solapar — nunca inferir de un
 * booleano o de una clave repetida qué es cada cosa — y llevan el tono
 * elegido en Ajustes (`getTone`). El diario y el semanal también el
 * comentario del día (uno o dos frases escritas en Hoy, `./dayComments`) —
 * a diferencia del journal, que nunca entra en este archivo y así
 * estructuralmente no hay forma de que se cuele en ningún análisis.
 */

import { addDays, startOfWeekISO, toISODate, todayISO } from './dates'
import { getDayComment, getDayCommentsInRange } from './dayComments'
import { listGoalUpdates, listWeeklyGoals } from './goals'
import { getTone, type Tone } from './preferences'
import { getEntriesInRange, listHabits } from './store'
import { joinErrorDetail, readFunctionErrorBody, supabase } from './supabase'
import { bucketTasks, listTasks } from './tasks'
import type { GoalDirection, GoalResult } from './types'
import { getWeeklyHabitStats } from './weeklyStats'

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
interface DailyAnalysisPayload {
  tipo: 'diario'
  fechaDeHoy: string
  habitos: HabitSummary[]
  tareasDeHoySinHacer: TaskItem[]
  tareasDeHoyHechas: TaskItem[]
  tareasAtrasadasDeDiasAnteriores: OverdueTaskItem[]
  /** Se manda calculado para que el modelo no tenga que contar la lista él mismo. */
  totalTareasAtrasadas: number
  /** El comentario del día, o `null` si no se escribió ninguno. Distinto del journal, que no entra aquí. */
  comentarioDelDia: string | null
  /** El tono elegido en Ajustes; decide qué instrucción usa la función. */
  tono: Tone
}

interface WeekRangePayload {
  inicio: string
  fin: string
}

interface WeeklyHabitStatsPayload {
  hecho: number
  noHecho: number
  sinResponder: number
  diasTranscurridos: number
}

interface WeeklyHabitPayload {
  nombre: string
  creadoEl: string
  estaSemana: WeeklyHabitStatsPayload
  semanaAnterior: WeeklyHabitStatsPayload | null
}

interface GoalUpdatePayload {
  fecha: string
  texto: string
  direccion: GoalDirection
}

interface GoalPayload {
  texto: string
  /** `null` mientras la meta no se cierra. */
  resultado: GoalResult | null
  avances: GoalUpdatePayload[]
}

/** Metas de una semana ya cerrada: solo el veredicto, sin la bitácora de avances. */
interface PastGoalPayload {
  texto: string
  resultado: GoalResult | null
}

interface DayCommentPayload {
  fecha: string
  texto: string
}

interface WeeklyAnalysisPayload {
  tipo: 'semanal'
  semanaActual: WeekRangePayload
  semanaAnterior: WeekRangePayload
  hayHistoriaSuficiente: boolean
  habitos: WeeklyHabitPayload[]
  metas: GoalPayload[]
  metasSemanaAnterior: PastGoalPayload[]
  /** Los comentarios del día de esta semana que sí se escribieron (los que no, no aparecen). */
  comentariosDeLaSemana: DayCommentPayload[]
  tono: Tone
}

/** Los dos estados desde los que se puede pedir análisis ("descartada" no ofrece el botón en la interfaz). */
type AnalyzableIdeaStatus = 'pendiente' | 'en-marcha'

/** Deliberadamente mínimo: solo el texto de ESA idea y su estado, nada más de la cuenta. */
interface IdeaAnalysisPayload {
  tipo: 'idea'
  texto: string
  estado: AnalyzableIdeaStatus
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

type TasksSummary = Omit<
  DailyAnalysisPayload,
  'tipo' | 'fechaDeHoy' | 'habitos' | 'comentarioDelDia' | 'tono'
>

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
 * Metas de esta semana (con su bitácora de avances) y de la anterior (solo su
 * veredicto final, sin avances: para una semana ya cerrada eso es lo que
 * importa para el análisis, no el detalle día a día).
 */
async function buildGoalsSummary(
  today: string,
): Promise<{ metas: GoalPayload[]; metasSemanaAnterior: PastGoalPayload[] }> {
  const thisMonday = startOfWeekISO(today)
  const lastMonday = addDays(thisMonday, -7)

  const [currentGoals, pastGoals] = await Promise.all([
    listWeeklyGoals(thisMonday),
    listWeeklyGoals(lastMonday),
  ])

  const metas = await Promise.all(
    currentGoals.map(async (g) => ({
      texto: g.text,
      resultado: g.resultado,
      avances: (await listGoalUpdates(g.id)).map((u) => ({
        fecha: u.date,
        texto: u.text,
        direccion: u.direction,
      })),
    })),
  )
  const metasSemanaAnterior = pastGoals.map((g) => ({ texto: g.text, resultado: g.resultado }))

  return { metas, metasSemanaAnterior }
}

/**
 * Mensaje a partir del cuerpo de error de la función. Si es saturación de
 * Gemini (`code: 'overloaded'`), un mensaje entendible y nada más — el
 * detalle técnico no ayuda ahí y solo confunde. Para cualquier otro error,
 * "error" + "detail" completos (compartido con otras funciones vía
 * `joinErrorDetail`, en `./supabase`).
 */
function messageFromBody(body: Record<string, unknown> | null | undefined): string | undefined {
  if (body?.code === 'overloaded' && typeof body.error === 'string') {
    return body.error
  }
  return joinErrorDetail(body)
}

/**
 * Llama a la Edge Function `analyze` con un payload ya armado (diario,
 * semanal o idea — los tres comparten esta misma función y este mismo
 * manejo de errores). No guarda nada: el texto vive solo en el estado de
 * quien lo pidió.
 */
async function invokeAnalyze(
  payload: DailyAnalysisPayload | WeeklyAnalysisPayload | IdeaAnalysisPayload,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    analysis?: string
    error?: string
    detail?: string
    code?: string
  }>('analyze', { body: payload })

  if (error) {
    const message = messageFromBody(await readFunctionErrorBody(error))
    throw new Error(message ?? error.message)
  }
  if (!data?.analysis) {
    throw new Error(messageFromBody(data) ?? 'No se pudo obtener el análisis.')
  }
  return data.analysis
}

/** El análisis diario: hábitos de los últimos 14 días + tareas de hoy y atrasadas. */
export async function requestAnalysis(): Promise<string> {
  const today = todayISO()
  const [habitos, tareas, comentario, tono] = await Promise.all([
    buildHabitsSummary(today),
    buildTasksSummary(today),
    getDayComment(today),
    getTone(),
  ])

  const payload: DailyAnalysisPayload = {
    tipo: 'diario',
    fechaDeHoy: today,
    habitos,
    ...tareas,
    comentarioDelDia: comentario?.text ?? null,
    tono,
  }
  return invokeAnalyze(payload)
}

/**
 * El análisis del dashboard semanal (Vida -> Semana): en qué mejoró cada
 * hábito y qué debería mejorar, comparando con la semana anterior cuando hay
 * suficiente historia. Usa exactamente los mismos números que los gráficos
 * del dashboard (`getWeeklyHabitStats`, en `./weeklyStats`) — no dos cálculos
 * distintos del mismo dato.
 */
export async function requestWeeklyAnalysis(): Promise<string> {
  const today = todayISO()
  const thisMonday = startOfWeekISO(today)

  const [stats, goals, comentarios, tono] = await Promise.all([
    getWeeklyHabitStats(today),
    buildGoalsSummary(today),
    getDayCommentsInRange(thisMonday, today),
    getTone(),
  ])

  const payload: WeeklyAnalysisPayload = {
    tipo: 'semanal',
    semanaActual: stats.semanaActual,
    semanaAnterior: stats.semanaAnterior,
    hayHistoriaSuficiente: stats.hayHistoriaSuficiente,
    habitos: stats.habitos.map((h) => ({
      nombre: h.habit.name,
      creadoEl: toISODate(new Date(h.habit.createdAt)),
      estaSemana: h.estaSemana,
      semanaAnterior: h.semanaAnterior,
    })),
    metas: goals.metas,
    metasSemanaAnterior: goals.metasSemanaAnterior,
    comentariosDeLaSemana: comentarios.map((c) => ({ fecha: c.date, texto: c.text })),
    tono,
  }
  return invokeAnalyze(payload)
}

/**
 * El análisis de una sola idea (pestaña Ideas): "Mejoras y huecos" y "Primer
 * paso", nada más — la estructura la fija el prompt del lado de la función.
 * Solo se manda el texto y el estado de esa idea, nunca la lista completa ni
 * ningún otro dato de la cuenta. El resultado no se guarda: vive en el
 * estado de quien lo pidió (`IdeaCard`), igual que el resto de análisis.
 */
export async function requestIdeaAnalysis(
  texto: string,
  estado: AnalyzableIdeaStatus,
): Promise<string> {
  const tono = await getTone()
  const payload: IdeaAnalysisPayload = { tipo: 'idea', texto, estado, tono }
  return invokeAnalyze(payload)
}
