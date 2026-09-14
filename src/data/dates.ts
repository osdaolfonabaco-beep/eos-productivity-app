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
 * Días completos entre dos fechas `YYYY-MM-DD`: positivo si `b` es posterior a
 * `a`. Mediodía local por la misma razón que `addDays`.
 */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const da = new Date(ay, am - 1, ad, 12, 0, 0)
  const db = new Date(by, bm - 1, bd, 12, 0, 0)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
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

/** El último día del mes que contiene `isoDate`, como `YYYY-MM-DD`. */
function endOfMonthISO(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  return toISODate(new Date(y, m, 0)) // día 0 del mes siguiente = último día de este mes
}

/**
 * La quincena a la que pertenece `isoDate`, según el día del mes:
 * 1–15 es la primera, 16 en adelante la segunda.
 */
export function quincenaLabel(isoDate: string): 'primera' | 'segunda' {
  const day = Number(isoDate.split('-')[2])
  return day <= 15 ? 'primera' : 'segunda'
}

/**
 * El rango (`start`, `end`, ambos `YYYY-MM-DD`) de la quincena que contiene
 * `isoDate`. La primera va del 1 al 15; la segunda, del 16 al último día del
 * mes (28 a 31 según el mes).
 */
export function quincenaRange(isoDate: string): { start: string; end: string } {
  const [y, m] = isoDate.split('-').map(Number)
  const monthPrefix = `${y}-${String(m).padStart(2, '0')}`
  return quincenaLabel(isoDate) === 'primera'
    ? { start: `${monthPrefix}-01`, end: `${monthPrefix}-15` }
    : { start: `${monthPrefix}-16`, end: endOfMonthISO(isoDate) }
}
