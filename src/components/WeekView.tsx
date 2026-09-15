import { Fragment, useCallback, useMemo, type CSSProperties } from 'react'
import {
  addDays,
  entryStatus,
  getEntriesInRange,
  listHabits,
  startOfWeekISO,
  todayISO,
  type EntryStatus,
  type Habit,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { useMediaQuery } from '../useMediaQuery'
import { useMounted } from '../useMounted'
import { LoadError, Loading } from './ViewState'
import WeekDashboard from './WeekDashboard'
import WeeklyGoalsSection from './WeeklyGoalsSection'

/** Cuánto se retrasa la entrada de cada columna de día (0 = lunes). */
const CASCADE_DELAY_MS = 40

/** Estilo de entrada de una celda de un día concreto: opacidad + un leve desplazamiento vertical, en cascada por `dayIndex`. Solo transform/opacity: nada de layout. */
function enterStyle(mounted: boolean, dayIndex: number): CSSProperties {
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(4px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: 'var(--dur-entrada)',
    transitionTimingFunction: 'var(--ease-salida)',
    transitionDelay: `${dayIndex * CASCADE_DELAY_MS}ms`,
  }
}

/** Iniciales de lunes a domingo. X para miércoles, para no chocar con martes. */
const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Glifo, texto y fondo de cada estado en una celda. El color solo refuerza.
 * Fondo "lavado" (el mismo que baña una fila cumplida/fallada en Hoy), sin
 * sombra ni relieve: son decenas de celdas pequeñas, y ponerle profundidad a
 * cada una sería ruido. El relieve va en el contenedor de la cuadrícula.
 */
const CELL: Record<EntryStatus, { glyph: string; label: string; className: string }> = {
  done: { glyph: '✓', label: 'hecho', className: 'bg-hecho-lavado text-hecho' },
  'not-done': { glyph: '✕', label: 'no hecho', className: 'bg-fallado-lavado text-fallado' },
  unanswered: { glyph: '•', label: 'sin responder', className: 'bg-separador text-texto-tenue' },
}

/** `2026-09-08` con las opciones dadas, en español. Solo para mostrar. */
function formatDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', opts)
}

/** `8 – 14 de septiembre`, o `29 de septiembre – 5 de octubre` si cruza de mes. */
function formatRange(start: string, end: string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const startText = formatDate(
    start,
    sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' },
  )
  const endText = formatDate(end, { day: 'numeric', month: 'long' })
  return `${startText} – ${endText}`
}

/**
 * Cabecera de un día: inicial + número; resaltada si es hoy. `dayIndex`
 * (0 = lunes) fija el desfase de su entrada en cascada; ver `enterStyle`.
 */
function DayHead({
  iso,
  letter,
  isToday,
  mounted,
  dayIndex,
}: {
  iso: string
  letter: string
  isToday: boolean
  mounted: boolean
  dayIndex: number
}) {
  return (
    <div
      className={`pb-2 pt-1 text-sm ${isToday ? 'font-bold text-texto' : 'text-texto-tenue'}`}
      style={enterStyle(mounted, dayIndex)}
    >
      <div>{letter}</div>
      <div
        className={
          isToday
            ? 'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-acento text-white shadow-[var(--sombra-acento)]'
            : 'mt-0.5'
        }
      >
        {Number(iso.slice(8, 10))}
      </div>
    </div>
  )
}

/**
 * Una casilla de estado. Los bordes los pone cada disposición con
 * `className`. `dayIndex` (0 = lunes) fija el desfase de su entrada en
 * cascada, igual que en `DayHead`: todas las celdas de un mismo día entran
 * a la vez, formando la columna, sin necesitar agruparlas en un elemento
 * propio que rompería la maquetación de la cuadrícula (grid con
 * auto-colocación).
 */
function StatusCell({
  status,
  isToday,
  mounted,
  dayIndex,
  className = '',
}: {
  status: EntryStatus
  isToday: boolean
  mounted: boolean
  dayIndex: number
  className?: string
}) {
  const cell = CELL[status]
  return (
    <div
      className={`flex items-center justify-center py-2 ${cell.className} ${
        isToday ? 'ring-1 ring-inset ring-borde' : ''
      } ${className}`}
      style={enterStyle(mounted, dayIndex)}
    >
      <span aria-hidden="true">{cell.glyph}</span>
      <span className="sr-only">{cell.label}</span>
    </div>
  )
}

/**
 * La cuadrícula en sí (las dos disposiciones), separada de `WeekView` por
 * una sola razón: para que la cascada de entrada se dispare cuando la
 * cuadrícula misma aparece por primera vez —al montar este componente—, y
 * no cuando `WeekView` monta, que ocurre antes, mientras `data` todavía
 * está cargando (`WeekView` devuelve `<Loading />` hasta entonces, así que
 * este componente ni existe todavía).
 */
function WeekGrid({
  wide,
  days,
  today,
  habits,
  statusAt,
}: {
  wide: boolean
  days: string[]
  today: string
  habits: Habit[]
  statusAt: (habitId: string, date: string) => EntryStatus
}) {
  const mounted = useMounted()

  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
      {wide ? (
        <div className="grid grid-cols-[minmax(0,13rem)_repeat(7,minmax(2rem,1fr))] text-center text-base">
          <div />
          {days.map((iso, i) => (
            <DayHead key={iso} iso={iso} letter={DAY_LETTERS[i]} isToday={iso === today} mounted={mounted} dayIndex={i} />
          ))}

          {habits.map((h) => (
            <Fragment key={h.id}>
              <div
                title={h.name}
                className="self-center break-words border-t-[0.5px] border-separador px-2 py-2 text-right text-sm font-medium text-texto-cuerpo"
              >
                {h.name}
              </div>
              {days.map((iso, i) => (
                <StatusCell
                  key={iso}
                  status={statusAt(h.id, iso)}
                  isToday={iso === today}
                  mounted={mounted}
                  dayIndex={i}
                  className="border-l-[0.5px] border-t-[0.5px] border-separador"
                />
              ))}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="text-center text-base">
          <div className="grid grid-cols-7">
            {days.map((iso, i) => (
              <DayHead
                key={iso}
                iso={iso}
                letter={DAY_LETTERS[i]}
                isToday={iso === today}
                mounted={mounted}
                dayIndex={i}
              />
            ))}
          </div>

          {habits.map((h) => (
            <div key={h.id} className="mt-3 border-t-[0.5px] border-separador pt-3">
              <p className="mb-1 break-words text-left text-sm font-medium text-texto-cuerpo">
                {h.name}
              </p>
              <div className="grid grid-cols-7 overflow-hidden rounded-campo">
                {days.map((iso, i) => (
                  <StatusCell
                    key={iso}
                    status={statusAt(h.id, iso)}
                    isToday={iso === today}
                    mounted={mounted}
                    dayIndex={i}
                    className="border-l-[0.5px] border-separador first:border-l-0"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * La vista de semana: hábitos × 7 días (lunes a domingo) con lo cumplido.
 * Solo lectura: marcar se hace en la pestaña "Hoy". Siempre la semana actual.
 *
 * Dos disposiciones: en pantalla ancha, tabla con la columna del nombre
 * quedándose todo el espacio libre; en estrecha, el nombre completo en su
 * línea y debajo sus 7 casillas a lo ancho.
 */
export default function WeekView() {
  const today = todayISO()
  const wide = useMediaQuery('(min-width: 480px)')
  const monday = useMemo(() => startOfWeekISO(today), [today])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  )
  const sunday = days[6]

  const fetcher = useCallback(async () => {
    const [habits, entries] = await Promise.all([
      listHabits(),
      getEntriesInRange(monday, sunday),
    ])
    // Clave `${habitId}|${date}` → estado. Lo que no está en el mapa es "sin responder".
    const statuses = new Map<string, EntryStatus>()
    for (const e of entries) statuses.set(`${e.habitId}|${e.date}`, entryStatus(e))
    return { habits, statuses }
  }, [monday, sunday])

  const { data, loading, error, reload } = useAsyncData(fetcher, [monday, sunday])

  function statusAt(habitId: string, date: string): EntryStatus {
    return data?.statuses.get(`${habitId}|${date}`) ?? 'unanswered'
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const habits: Habit[] = data?.habits ?? []

  return (
    <main className="px-4 pb-6 pt-4 text-texto">
      <p className="mb-4 text-meta text-texto-tenue">{formatRange(monday, sunday)}</p>

      <WeeklyGoalsSection />

      <section className="mt-8">
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Cuadrícula</h2>

        {habits.length === 0 ? (
          <p className="rounded-tarjeta border border-dashed border-borde px-4 py-8 text-center text-texto-apagado">
            No tienes hábitos. Créalos en Hábitos.
          </p>
        ) : (
          <>
            <WeekGrid wide={wide} days={days} today={today} habits={habits} statusAt={statusAt} />

            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-apagado">
              <span>
                <span className="text-hecho">✓</span> hecho
              </span>
              <span>
                <span className="text-fallado">✕</span> no hecho
              </span>
              <span>
                <span className="text-texto-tenue">•</span> sin responder
              </span>
            </p>
          </>
        )}
      </section>

      <WeekDashboard />
    </main>
  )
}
