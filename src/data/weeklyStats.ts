/**
 * El desglose semanal de hábitos: cuánto se cumplió esta semana y, si el
 * hábito ya existía la semana completa anterior, cuánto se cumplió entonces.
 * Un solo sitio para este cálculo porque lo consumen dos cosas distintas: los
 * gráficos del dashboard (`WeekDashboard`) y el payload que se manda a la IA
 * (`requestWeeklyAnalysis`, en `analysis.ts`) — ambos necesitan exactamente
 * los mismos números, solo que uno los dibuja y el otro los describe.
 */

import { addDays, daysBetween, startOfWeekISO, toISODate, todayISO } from './dates'
import { getEntriesInRange, listAllHabits, listHabits } from './store'
import type { Habit } from './types'

export interface WeekRange {
  inicio: string
  fin: string
}

export interface HabitWeekStats {
  hecho: number
  noHecho: number
  sinResponder: number
  /** Días de esa semana que ya pasaron Y en los que el hábito ya existía. */
  diasTranscurridos: number
}

export interface HabitWeeklyBreakdown {
  habit: Habit
  estaSemana: HabitWeekStats
  /** `null` si el hábito no llegó a existir toda la semana anterior completa. */
  semanaAnterior: HabitWeekStats | null
}

export interface WeeklyStats {
  semanaActual: WeekRange
  semanaAnterior: WeekRange
  /** `true` si al menos un hábito tiene semana anterior completa que comparar. */
  hayHistoriaSuficiente: boolean
  habitos: HabitWeeklyBreakdown[]
}

/**
 * Cuenta hecho/no-hecho/sin-responder de `habit` entre `range.inicio` y
 * `range.fin`, sin pasarse de `today` (días futuros de la semana actual no
 * cuentan) ni de la fecha de creación del hábito (días previos tampoco).
 * `diasTranscurridos` es cuántos días de esa ventana sí contaron.
 *
 * A pesar del nombre y de vivir en este archivo, no asume que `range` sea
 * una semana -- son solo dos fechas. `getMentorCalculatedStats` (más abajo)
 * la reutiliza tal cual sobre una ventana de meses, para no duplicar este
 * conteo con una segunda versión casi igual.
 */
export function statsFor(
  habit: Habit,
  entriesByKey: Map<string, boolean>,
  range: WeekRange,
  today: string,
): HabitWeekStats {
  const createdDate = toISODate(new Date(habit.createdAt))
  const lastDay = range.fin > today ? today : range.fin

  let hecho = 0
  let noHecho = 0
  let sinResponder = 0
  let diasTranscurridos = 0

  for (let d = range.inicio; d <= lastDay; d = addDays(d, 1)) {
    if (d < createdDate) continue // el hábito no existía ese día: no cuenta ni a favor ni en contra
    diasTranscurridos++
    const done = entriesByKey.get(`${habit.id}|${d}`)
    if (done === undefined) sinResponder++
    else if (done) hecho++
    else noHecho++
  }

  return { hecho, noHecho, sinResponder, diasTranscurridos }
}

/** El desglose de la semana actual y la anterior, para todos los hábitos activos. */
export async function getWeeklyHabitStats(today: string): Promise<WeeklyStats> {
  const thisMonday = startOfWeekISO(today)
  const thisSunday = addDays(thisMonday, 6)
  const lastMonday = addDays(thisMonday, -7)
  const lastSunday = addDays(thisMonday, -1)

  const habits = await listHabits()
  const entries = habits.length > 0 ? await getEntriesInRange(lastMonday, today) : []

  const entriesByKey = new Map<string, boolean>()
  for (const e of entries) entriesByKey.set(`${e.habitId}|${e.date}`, e.done)

  const habitos: HabitWeeklyBreakdown[] = habits.map((habit) => {
    const estaSemana = statsFor(habit, entriesByKey, { inicio: thisMonday, fin: thisSunday }, today)
    const semanaAnteriorStats = statsFor(
      habit,
      entriesByKey,
      { inicio: lastMonday, fin: lastSunday },
      today,
    )
    // Solo cuenta como comparable si existió los 7 días de la semana anterior.
    const semanaAnterior = semanaAnteriorStats.diasTranscurridos === 7 ? semanaAnteriorStats : null
    return { habit, estaSemana, semanaAnterior }
  })

  return {
    semanaActual: { inicio: thisMonday, fin: thisSunday },
    semanaAnterior: { inicio: lastMonday, fin: lastSunday },
    hayHistoriaSuficiente: habitos.some((h) => h.semanaAnterior !== null),
    habitos,
  }
}

/** El resultado de `getWeekCompletionPercentages` para una sola semana. */
export interface WeekCompletion {
  pct: number
  /**
   * Señal CONSERVADORA de que este número podría no ser exacto: ver el
   * comentario grande de `getWeekCompletionPercentages`, justo abajo, antes
   * de decidir qué hacer con esto en la interfaz.
   */
  quizasIncompleto: boolean
}

/**
 * El % de cumplimiento (hecho / días transcurridos) de cada semana de
 * `weekStarts`, todas de una vez -- pensado para pantallas que miran hacia
 * atrás sobre MUCHAS semanas de golpe (el historial del Mentor), no para el
 * dashboard en vivo de una semana sola. Un solo `listAllHabits()` y un solo
 * `getEntriesInRange()` que cubre desde la primera semana pedida hasta la
 * última, sin importar cuántas semanas se pidan.
 *
 * ============================================================================
 * POR QUÉ NO REUTILIZA `getWeeklyHabitStats` -- LÉELO ANTES DE UNIFICARLAS
 * ============================================================================
 * `getWeeklyHabitStats` llama a `listHabits()`, que filtra `archived =
 * false` -- correcto para el dashboard EN VIVO (Vida -> Semana), que solo
 * quiere enseñar los hábitos que sigues llevando hoy. Pero para una semana
 * PASADA eso falsea el resultado: si un hábito estuvo activo esa semana y
 * DESPUÉS se archivó, sus `habit_entries` de esa semana siguen existiendo
 * intactos -- pero `listHabits()` ya no lo trae, así que su aporte
 * desaparece de la cuenta sin ningún aviso. El % de esa semana pasada
 * quedaría calculado con menos datos de los que de verdad hubo.
 *
 * Esta función usa `listAllHabits()` (activos Y archivados) a propósito.
 * No hay `archived_at` en el esquema, así que no se puede saber el día
 * exacto en que un hábito se archivó: si fue a mitad de esa semana, sus
 * días posteriores a ese momento cuentan aquí como "sin responder" en vez
 * de "ya no aplica". Por eso cada resultado lleva `quizasIncompleto` -- una
 * señal CONSERVADORA (se enciende si algún hábito que contó esa semana está
 * archivado HOY, aunque se haya archivado mucho después y esa semana en
 * concreto esté perfectamente completa) para que la interfaz pueda avisarlo
 * en vez de fingir una precisión que el esquema no tiene.
 *
 * Si en el futuro "simplificas" esto reemplazándola por
 * `getWeeklyHabitStats`, estás reintroduciendo el sesgo de arriba: las
 * semanas pasadas con algún hábito ya archivado volverán a calcularse mal,
 * en silencio.
 * ============================================================================
 */
export async function getWeekCompletionPercentages(
  weekStarts: string[],
): Promise<Map<string, WeekCompletion>> {
  const result = new Map<string, WeekCompletion>()
  if (weekStarts.length === 0) return result

  const today = todayISO()
  const sorted = [...weekStarts].sort()
  const rangeStart = sorted[0]
  const rangeEnd = addDays(sorted[sorted.length - 1], 6)

  const [habits, entries] = await Promise.all([
    listAllHabits(),
    getEntriesInRange(rangeStart, rangeEnd),
  ])
  const entriesByKey = new Map(entries.map((e) => [`${e.habitId}|${e.date}`, e.done]))

  for (const weekStart of weekStarts) {
    const weekEnd = addDays(weekStart, 6)
    const relevant = habits.filter((h) => toISODate(new Date(h.createdAt)) <= weekEnd)
    if (relevant.length === 0) continue // ningún hábito existía todavía esa semana: no hay nada que calcular

    let hecho = 0
    let diasTranscurridos = 0
    let quizasIncompleto = false
    const lastDay = weekEnd > today ? today : weekEnd
    for (const habit of relevant) {
      if (habit.archived) quizasIncompleto = true
      const createdDate = toISODate(new Date(habit.createdAt))
      for (let d = weekStart; d <= lastDay; d = addDays(d, 1)) {
        if (d < createdDate) continue
        diasTranscurridos++
        if (entriesByKey.get(`${habit.id}|${d}`)) hecho++
      }
    }

    if (diasTranscurridos > 0) {
      result.set(weekStart, {
        pct: Math.round((hecho / diasTranscurridos) * 100),
        quizasIncompleto,
      })
    }
  }

  return result
}

// --- Cifras calculadas del resumen acumulado del mentor -------------------
//
// Las cuatro cifras que `updateMentorSummary` (en `./analysis`) manda a la
// Edge Function junto con los últimos análisis. Viven aquí, no en
// `./mentor` ni en `./analysis`, porque son estadísticas de hábitos como
// las de arriba -- mismo criterio que ya explica el comentario de cabecera
// de este archivo.

/**
 * Ventana de "los últimos meses" para el cumplimiento por hábito, el peor
 * hábito y la tendencia -- unos 3 meses. La racha más larga es la única
 * cifra que mira TODO el historial, no esta ventana (ver el comentario de
 * `getMentorCalculatedStats`).
 */
const RESUMEN_WINDOW_DAYS = 90

/**
 * Por debajo de este número de días de historial (dentro de la ventana), un
 * hábito no se señala como "el que peor va": es pronto para juzgarlo.
 */
const MIN_DIAS_PARA_PEOR_HABITO = 14

export interface HabitComplianceStat {
  habitId: string
  nombre: string
  pct: number
}

export interface PeorHabitoStat {
  nombre: string
  pct: number
  /**
   * Fecha local desde la que no se marca "hecho": el día siguiente al
   * último que sí lo tuvo, o su fecha de creación si nunca se ha hecho.
   */
  sinCumplirDesde: string
}

export interface RachaMasLargaStat {
  habito: string
  dias: number
}

export type Tendencia = 'sube' | 'baja' | 'estable'

export interface MentorCalculatedStats {
  cumplimientoPorHabito: HabitComplianceStat[]
  /** `null` si ningún hábito tiene historia suficiente para señalarlo como "el peor" (ver `MIN_DIAS_PARA_PEOR_HABITO`). */
  peorHabito: PeorHabitoStat | null
  /** `null` si ningún hábito activo tiene todavía un solo día marcado "hecho". */
  rachaMasLarga: RachaMasLargaStat | null
  /** `null` si no hay al menos dos de las últimas 4 semanas con % calculable. */
  tendencia: Tendencia | null
}

/** El último día, buscando hacia atrás desde `today`, en que `habit` se marcó "hecho"; `null` si nunca. */
function lastDoneDate(habit: Habit, entriesByKey: Map<string, boolean>, today: string): string | null {
  const createdDate = toISODate(new Date(habit.createdAt))
  for (let d = today; d >= createdDate; d = addDays(d, -1)) {
    if (entriesByKey.get(`${habit.id}|${d}`)) return d
  }
  return null
}

/** La racha de días consecutivos marcados "hecho" más larga de `habit`, sobre todo su historial hasta `today`. */
function longestStreak(habit: Habit, entriesByKey: Map<string, boolean>, today: string): number {
  const createdDate = toISODate(new Date(habit.createdAt))
  let longest = 0
  let current = 0
  for (let d = createdDate; d <= today; d = addDays(d, 1)) {
    if (entriesByKey.get(`${habit.id}|${d}`)) {
      current++
      if (current > longest) longest = current
    } else {
      current = 0
    }
  }
  return longest
}

/**
 * Compara el % de la primera y la última de `weekStarts` (se espera una
 * lista de semanas consecutivas, de la más antigua a la más reciente).
 * `TENDENCIA_UMBRAL` evita que una diferencia de uno o dos puntos, ruido
 * normal, se lea como una tendencia real. `null` si no hay al menos dos
 * semanas con % calculado -- con una sola no hay nada que comparar.
 */
const TENDENCIA_UMBRAL = 5

function computeTendencia(weekStarts: string[], pcts: Map<string, WeekCompletion>): Tendencia | null {
  const valores = weekStarts.map((w) => pcts.get(w)?.pct).filter((v): v is number => v !== undefined)
  if (valores.length < 2) return null
  const diff = valores[valores.length - 1] - valores[0]
  if (diff > TENDENCIA_UMBRAL) return 'sube'
  if (diff < -TENDENCIA_UMBRAL) return 'baja'
  return 'estable'
}

/**
 * Las cuatro cifras calculadas del resumen acumulado del mentor (ver el
 * comentario de cabecera de `updateMentorSummary`, en `./analysis`): nunca
 * las escribe la IA, se recalculan aquí cada vez que se piden.
 *
 * Usa solo hábitos ACTIVOS (`listHabits()`), mismo criterio que
 * `getWeeklyHabitStats` y no el de `getWeekCompletionPercentages`: esto
 * describe cómo le va a la persona HOY con lo que sigue llevando, no una
 * cifra históricamente exacta para dibujar semanas ya pasadas -- si un
 * hábito se archivó, ya no es parte de "lo que lleva observado" que el
 * mentor le comenta.
 *
 * `cumplimientoPorHabito`, `peorHabito` y `tendencia` miran una ventana de
 * `RESUMEN_WINDOW_DAYS` (~3 meses). `rachaMasLarga` es la única que mira
 * TODO el historial de cada hábito -- un récord no se reinicia cada
 * trimestre, así que necesita ver más atrás que las otras tres. Por eso la
 * consulta a `getEntriesInRange` arranca en la fecha de creación del hábito
 * activo más antiguo cuando esa fecha cae antes que la ventana de 3 meses,
 * no en la propia ventana.
 */
export async function getMentorCalculatedStats(today: string): Promise<MentorCalculatedStats> {
  const habits = await listHabits()
  if (habits.length === 0) {
    return { cumplimientoPorHabito: [], peorHabito: null, rachaMasLarga: null, tendencia: null }
  }

  const windowStart = addDays(today, -(RESUMEN_WINDOW_DAYS - 1))
  const earliestCreated = habits.reduce((min, h) => {
    const created = toISODate(new Date(h.createdAt))
    return created < min ? created : min
  }, windowStart)
  const rangeStart = earliestCreated < windowStart ? earliestCreated : windowStart

  const entries = await getEntriesInRange(rangeStart, today)
  const entriesByKey = new Map<string, boolean>()
  for (const e of entries) entriesByKey.set(`${e.habitId}|${e.date}`, e.done)

  const cumplimientoPorHabito: HabitComplianceStat[] = habits.map((h) => {
    const stats = statsFor(h, entriesByKey, { inicio: windowStart, fin: today }, today)
    const pct = stats.diasTranscurridos > 0 ? Math.round((stats.hecho / stats.diasTranscurridos) * 100) : 0
    return { habitId: h.id, nombre: h.name, pct }
  })

  const candidatosPeor = habits
    .map((h, i) => ({ habit: h, compliance: cumplimientoPorHabito[i] }))
    .filter(({ habit }) => {
      const createdDate = toISODate(new Date(habit.createdAt))
      const diasDesdeCreacion = daysBetween(createdDate, today) + 1
      return Math.min(diasDesdeCreacion, RESUMEN_WINDOW_DAYS) >= MIN_DIAS_PARA_PEOR_HABITO
    })
  let peorHabito: PeorHabitoStat | null = null
  if (candidatosPeor.length > 0) {
    const peor = candidatosPeor.reduce((min, c) => (c.compliance.pct < min.compliance.pct ? c : min))
    const done = lastDoneDate(peor.habit, entriesByKey, today)
    const sinCumplirDesde = done ? addDays(done, 1) : toISODate(new Date(peor.habit.createdAt))
    peorHabito = { nombre: peor.compliance.nombre, pct: peor.compliance.pct, sinCumplirDesde }
  }

  let rachaMasLarga: RachaMasLargaStat | null = null
  for (const h of habits) {
    const dias = longestStreak(h, entriesByKey, today)
    if (dias > 0 && (rachaMasLarga === null || dias > rachaMasLarga.dias)) {
      rachaMasLarga = { habito: h.name, dias }
    }
  }

  const thisMonday = startOfWeekISO(today)
  const weekStarts = [addDays(thisMonday, -21), addDays(thisMonday, -14), addDays(thisMonday, -7), thisMonday]
  const pctByWeek = await getWeekCompletionPercentages(weekStarts)
  const tendencia = computeTendencia(weekStarts, pctByWeek)

  return { cumplimientoPorHabito, peorHabito, rachaMasLarga, tendencia }
}
