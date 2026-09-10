import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { useMediaQuery } from '../useMediaQuery'

/** Iniciales de lunes a domingo. X para miércoles, para no chocar con martes. */
const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Glifo, texto y fondo de cada estado en una celda. El color solo refuerza. */
const CELL: Record<EntryStatus, { glyph: string; label: string; className: string }> = {
  done: { glyph: '✓', label: 'hecho', className: 'bg-green-50 text-green-700' },
  'not-done': { glyph: '✕', label: 'no hecho', className: 'bg-rose-50 text-rose-700' },
  unanswered: { glyph: '•', label: 'sin responder', className: 'text-gray-300' },
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

/** Cabecera de un día: inicial + número; resaltada si es hoy. */
function DayHead({ iso, letter, isToday }: { iso: string; letter: string; isToday: boolean }) {
  return (
    <div className={`pb-2 text-sm ${isToday ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
      <div>{letter}</div>
      <div
        className={
          isToday
            ? 'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white'
            : 'mt-0.5'
        }
      >
        {Number(iso.slice(8, 10))}
      </div>
    </div>
  )
}

/** Una casilla de estado. Los bordes los pone cada disposición con `className`. */
function StatusCell({
  status,
  isToday,
  className = '',
}: {
  status: EntryStatus
  isToday: boolean
  className?: string
}) {
  const cell = CELL[status]
  return (
    <div
      className={`flex items-center justify-center py-2 ${cell.className} ${
        isToday ? 'ring-1 ring-inset ring-gray-200' : ''
      } ${className}`}
    >
      <span aria-hidden="true">{cell.glyph}</span>
      <span className="sr-only">{cell.label}</span>
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

  const [habits, setHabits] = useState<Habit[]>([])
  // Clave `${habitId}|${date}` → estado. Lo que no está en el mapa es "sin responder".
  const [statuses, setStatuses] = useState<Map<string, EntryStatus>>(new Map())

  useEffect(() => {
    setHabits(listHabits())
    const map = new Map<string, EntryStatus>()
    for (const e of getEntriesInRange(monday, sunday)) {
      map.set(`${e.habitId}|${e.date}`, entryStatus(e))
    }
    setStatuses(map)
  }, [monday, sunday])

  function statusAt(habitId: string, date: string): EntryStatus {
    return statuses.get(`${habitId}|${date}`) ?? 'unanswered'
  }

  return (
    <main className="px-4 py-6 text-gray-900">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Semana</h1>
        <p className="text-sm text-gray-500">{formatRange(monday, sunday)}</p>
      </header>

      {habits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
          No tienes hábitos. Créalos en la pestaña Hábitos.
        </p>
      ) : (
        <>
          {wide ? (
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,2rem)] text-center text-base">
              <div />
              {days.map((iso, i) => (
                <DayHead key={iso} iso={iso} letter={DAY_LETTERS[i]} isToday={iso === today} />
              ))}

              {habits.map((h) => (
                <Fragment key={h.id}>
                  <div
                    title={h.name}
                    className="self-center break-words border-t border-gray-100 py-2 pr-2 text-left text-sm text-gray-800"
                  >
                    {h.name}
                  </div>
                  {days.map((iso) => (
                    <StatusCell
                      key={iso}
                      status={statusAt(h.id, iso)}
                      isToday={iso === today}
                      className="border-l border-t border-gray-100"
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
                  />
                ))}
              </div>

              {habits.map((h) => (
                <div key={h.id} className="mt-3 border-t border-gray-100 pt-3">
                  <p className="mb-1 break-words text-left text-sm text-gray-800">{h.name}</p>
                  <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-gray-100">
                    {days.map((iso) => (
                      <StatusCell
                        key={iso}
                        status={statusAt(h.id, iso)}
                        isToday={iso === today}
                        className="border-l border-gray-100 first:border-l-0"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              <span className="text-green-700">✓</span> hecho
            </span>
            <span>
              <span className="text-rose-700">✕</span> no hecho
            </span>
            <span>
              <span className="text-gray-300">•</span> sin responder
            </span>
          </p>
        </>
      )}
    </main>
  )
}
