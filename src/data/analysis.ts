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
 *   Vida -> Semana. También la semana anterior de ambos, para comparar. Y las
 *   ideas que se cerraron esta semana (pasaron a 'hecha' o a 'descartada',
 *   `./ideas`), con su texto y en qué quedaron.
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
 *
 * El diario y el semanal también llevan `proposito` (`./mentorPurpose`) si
 * el usuario ha escrito uno — qué está intentando lograr, en qué plazo y
 * qué le está costando, para que el mentor relacione lo que observa con
 * eso en vez de describir los datos en abstracto. Si no hay propósito
 * escrito, la clave se omite entera (nunca se manda `proposito: null`).
 * `requestIdeaAnalysis` NO lo lleva a propósito: ahí no aporta nada y
 * sería mandar la situación personal del usuario a cambio de nada.
 */

import { addDays, startOfWeekISO, toISODate, todayISO } from './dates'
import { getDayComment, getDayCommentsInRange } from './dayComments'
import { listGoalUpdates, listWeeklyGoals } from './goals'
import { listClosedIdeas } from './ideas'
import { saveMentorAnalysis, type MentorAnalysisInput } from './mentor'
import { getMentorPurpose, isMentorPurposeStale } from './mentorPurpose'
import { getTone, type Tone } from './preferences'
import { getEntriesInRange, listHabits } from './store'
import { joinErrorDetail, readFunctionErrorBody, supabase } from './supabase'
import { bucketTasks, listTasks } from './tasks'
import type { GoalDirection, GoalResult } from './types'
import { getWeeklyHabitStats } from './weeklyStats'

const DAYS_BACK = 14

/**
 * Por debajo de este número de ideas cerradas en la semana, no hay caso
 * suficiente para que el análisis afirme un patrón (dos o tres datos no son
 * una tendencia).
 */
const MIN_IDEAS_CERRADAS_PARA_PATRON = 5

interface HabitSummary {
  nombre: string
  /** Cada carácter es un día: H/N/. como antes, o "_" si el hábito no existía ese día. */
  ultimos14dias: string
  /** Fecha local (YYYY-MM-DD) en que se creó el hábito. */
  creadoEl: string
  /** Días de historial real dentro de la ventana, ya calculados (máx. 14). */
  diasConHistorial: number
}

/**
 * El "para qué" del usuario, tal como viaja en el payload. `masDeUnMesSinRevisar`
 * se manda ya calculado (`isMentorPurposeStale`), mismo criterio que
 * `totalTareasAtrasadas` o `hayIdeasCerradasSuficientes` más abajo: el
 * modelo no tiene que hacer aritmética de fechas sobre un timestamp, que es
 * justo el tipo de cálculo que se le pide evitar en el resto de este
 * archivo.
 */
interface PropositoPayload {
  objetivo: string | null
  plazo: string | null
  dificultad: string | null
  masDeUnMesSinRevisar: boolean
}

async function buildPropositoPayload(): Promise<PropositoPayload | undefined> {
  const purpose = await getMentorPurpose()
  if (!purpose) return undefined
  return {
    objetivo: purpose.objetivo,
    plazo: purpose.plazo,
    dificultad: purpose.dificultad,
    masDeUnMesSinRevisar: isMentorPurposeStale(purpose),
  }
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
  /** Ausente si el usuario no ha escrito un propósito -- ver el comentario de cabecera. */
  proposito?: PropositoPayload
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

/** Una idea que se cerró esta semana: en qué quedó, con su texto. */
interface ClosedIdeaPayload {
  texto: string
  estado: 'hecha' | 'descartada'
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
  /** Las ideas que pasaron a 'hecha' o a 'descartada' esta semana (las que siguen abiertas no aparecen). */
  ideasCerradas: ClosedIdeaPayload[]
  /**
   * `true` si el TOTAL histórico de ideas cerradas (de cualquier semana, no
   * solo esta) llega a `MIN_IDEAS_CERRADAS_PARA_PATRON` -- se manda
   * calculado para que el modelo no tenga que contar nada él mismo. Cerrar
   * cinco ideas en una sola semana casi nunca pasa; lo que decide si hay
   * caso para un patrón es el historial acumulado.
   */
  hayIdeasCerradasSuficientes: boolean
  tono: Tone
  /** Ausente si el usuario no ha escrito un propósito -- ver el comentario de cabecera. */
  proposito?: PropositoPayload
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
 * `ideasCerradas`: las que pasaron a 'hecha' o a 'descartada' entre
 * `thisMonday` y `today` (fechas locales, inclusive) -- lo que se cuenta en
 * el prompt. `totalIdeasCerradas`: TODAS las cerradas alguna vez, sin
 * importar la semana -- decide si hay caso suficiente para hablar de un
 * patrón (cerrar cinco ideas en una sola semana casi nunca pasa; lo que
 * importa es el historial acumulado). Ambas usan `closedAt` -- fijado por
 * `setIdeaStatus` solo al cambiar el estado -- y no `updatedAt`, que también
 * cambia al editar el texto: una idea cerrada hace meses no debe parecer
 * cerrada esta semana solo porque se le corrigió una palabra.
 */
async function buildClosedIdeasSummary(
  thisMonday: string,
  today: string,
): Promise<{ ideasCerradas: ClosedIdeaPayload[]; totalIdeasCerradas: number }> {
  const closed = await listClosedIdeas()
  const ideasCerradas = closed
    .filter((i) => {
      if (i.closedAt == null) return false
      const closedDate = toISODate(new Date(i.closedAt))
      return closedDate >= thisMonday && closedDate <= today
    })
    .map((i) => ({ texto: i.text, estado: i.status as 'hecha' | 'descartada' }))
  return { ideasCerradas, totalIdeasCerradas: closed.length }
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

/**
 * Guarda un análisis diario o semanal ya producido, para el historial del
 * mentor (`./mentor`). `incluyoDinero` siempre en `false`: ningún payload de
 * los de arriba manda datos de Dinero todavía.
 *
 * Si el guardado falla, el error se registra y NUNCA se propaga: la persona
 * ya pidió este análisis y ya lo va a ver en pantalla, un fallo al
 * guardarlo no puede quitárselo. Por eso quien llama a esta función lo hace
 * sin `await` (ver `requestAnalysis`/`requestWeeklyAnalysis`) — no hay
 * ninguna promesa sin capturar porque el `catch` de aquí ya la resuelve.
 *
 * `onFailed`, si se pasa, avisa de un fallo TOTAL (nunca de que vaya bien:
 * eso no lo necesita nadie todavía). `AnalysisSection` lo usa para marcar
 * "no guardado" en la entrada local que muestra mientras tanto — sigue sin
 * ser un `await`, solo una notificación que llega cuando llega.
 */
async function saveAnalysisQuietly(
  input: Omit<MentorAnalysisInput, 'incluyoDinero'>,
  onFailed?: () => void,
): Promise<void> {
  try {
    await saveMentorAnalysis({ ...input, incluyoDinero: false })
  } catch (err) {
    console.error('No se pudo guardar el análisis del mentor:', err)
    onFailed?.()
  }
}

/**
 * El análisis diario: hábitos de los últimos 14 días + tareas de hoy y
 * atrasadas. `onSaveFailed`, opcional, avisa si el guardado en segundo plano
 * falló del todo (ver `saveAnalysisQuietly`) — nada más lo necesita hoy
 * salvo `AnalysisSection`, para marcar la entrada como "no guardada".
 */
export async function requestAnalysis(onSaveFailed?: () => void): Promise<string> {
  const today = todayISO()
  const [habitos, tareas, comentario, tono, proposito] = await Promise.all([
    buildHabitsSummary(today),
    buildTasksSummary(today),
    getDayComment(today),
    getTone(),
    buildPropositoPayload(),
  ])

  const payload: DailyAnalysisPayload = {
    tipo: 'diario',
    fechaDeHoy: today,
    habitos,
    ...tareas,
    comentarioDelDia: comentario?.text ?? null,
    tono,
    ...(proposito ? { proposito } : {}),
  }
  const contenido = await invokeAnalyze(payload)
  // Sin `await` a propósito: guardar en segundo plano para no retrasar un
  // análisis que la persona ya está esperando ver, justo después de haber
  // esperado a la IA.
  void saveAnalysisQuietly(
    { tipo: 'diario', periodStart: today, periodEnd: today, tono, contenido },
    onSaveFailed,
  )
  return contenido
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

  const [stats, goals, comentarios, ideasCerradasInfo, tono, proposito] = await Promise.all([
    getWeeklyHabitStats(today),
    buildGoalsSummary(today),
    getDayCommentsInRange(thisMonday, today),
    buildClosedIdeasSummary(thisMonday, today),
    getTone(),
    buildPropositoPayload(),
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
    ideasCerradas: ideasCerradasInfo.ideasCerradas,
    hayIdeasCerradasSuficientes: ideasCerradasInfo.totalIdeasCerradas >= MIN_IDEAS_CERRADAS_PARA_PATRON,
    tono,
    ...(proposito ? { proposito } : {}),
  }
  const contenido = await invokeAnalyze(payload)
  // Sin `await`, mismo criterio que en requestAnalysis: no retrasar lo que
  // ya se puede leer.
  void saveAnalysisQuietly({
    tipo: 'semanal',
    periodStart: stats.semanaActual.inicio,
    periodEnd: stats.semanaActual.fin,
    tono,
    contenido,
  })
  return contenido
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
