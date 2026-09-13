/**
 * El desglose semanal de hábitos: cuánto se cumplió esta semana y, si el
 * hábito ya existía la semana completa anterior, cuánto se cumplió entonces.
 * Un solo sitio para este cálculo porque lo consumen dos cosas distintas: los
 * gráficos del dashboard (`WeekDashboard`) y el payload que se manda a la IA
 * (`requestWeeklyAnalysis`, en `analysis.ts`) — ambos necesitan exactamente
 * los mismos números, solo que uno los dibuja y el otro los describe.
 */

import { addDays, startOfWeekISO, toISODate } from './dates'
import { getEntriesInRange, listHabits } from './store'
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
