/**
 * El desglose semanal de hábitos: cuánto se cumplió esta semana y, si el
 * hábito ya existía la semana completa anterior, cuánto se cumplió entonces.
 * Un solo sitio para este cálculo porque lo consumen dos cosas distintas: los
 * gráficos del dashboard (`WeekDashboard`) y el payload que se manda a la IA
 * (`requestWeeklyAnalysis`, en `analysis.ts`) — ambos necesitan exactamente
 * los mismos números, solo que uno los dibuja y el otro los describe.
 */

import { addDays, startOfWeekISO, toISODate, todayISO } from './dates'
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
 */
function statsFor(
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
