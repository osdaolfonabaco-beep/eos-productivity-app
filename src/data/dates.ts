/**
 * Utilidades de fecha en formato de texto `YYYY-MM-DD` y en hora LOCAL.
 *
 * Regla del proyecto: las fechas de los registros diarios son texto, no objetos
 * `Date`, para no arrastrar errores de zona horaria (la fuente número uno de
 * bugs en apps de seguimiento diario). `Date` se usa aquí solo como herramienta
 * de aritmética de calendario; lo que entra y sale de estas funciones es texto.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * ¿La cadena tiene la forma `YYYY-MM-DD`?
 * No comprueba que la fecha exista en el calendario (p. ej. acepta `2026-02-31`).
 */
export function isISODate(value: string): boolean {
  return ISO_DATE.test(value)
}

/** Convierte un `Date` a `YYYY-MM-DD` usando sus componentes LOCALES, no UTC. */
export function toISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** El día de hoy en hora local, como `YYYY-MM-DD`. */
export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * Suma `n` días a una fecha `YYYY-MM-DD` (o resta, con `n` negativo) y devuelve
 * otra fecha `YYYY-MM-DD`.
 *
 * Construye el `Date` intermedio a mediodía local para que ningún cambio de
 * horario de verano pueda mover el resultado al día anterior o siguiente.
 */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const base = new Date(y, m - 1, d, 12, 0, 0)
  base.setDate(base.getDate() + n)
  return toISODate(base)
}

/**
 * El lunes de la semana que contiene `isoDate`, como `YYYY-MM-DD`.
 * La semana va de lunes a domingo.
 */
export function startOfWeekISO(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dayOfWeek = new Date(y, m - 1, d).getDay() // 0 = domingo … 6 = sábado
  const sinceMonday = (dayOfWeek + 6) % 7
  return addDays(isoDate, -sinceMonday)
}
