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

/**
 * La vista de semana: una cuadrícula de hábitos × 7 días (lunes a domingo) con
 * lo cumplido en cada día. Solo lectura: marcar se hace en la pestaña "Hoy".
 *
 * Muestra siempre la semana actual; no hay navegación a otras semanas en la v1.
 */
export default function WeekView() {
  const today = todayISO()
  const monday = useMemo(() => startOfWeekISO(today), [today])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  )
  const sunday = days[6]

  const [habits, setHabits] = useState<Habit[]>([])
  // Clave `${habitId}|${date}` → estado. Lo que no está en el mapa es "sin responder".
  const [statuses, setStatuses] = useState<Map<string, EntryStatus>>(new Map())
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          <div className="grid grid-cols-[5.5rem_repeat(7,1fr)] text-center text-base">
            {/* Cabecera: esquina vacía + los 7 días */}
            <div />
            {days.map((d, i) => {
              const isToday = d === today
              return (
                <div
                  key={d}
                  className={`pb-2 text-sm ${isToday ? 'font-bold text-gray-900' : 'text-gray-500'}`}
                >
                  <div>{DAY_LETTERS[i]}</div>
                  <div
                    className={
                      isToday
                        ? 'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white'
                        : 'mt-0.5'
                    }
                  >
                    {Number(d.slice(8, 10))}
                  </div>
                </div>
              )
            })}

            {/* Una fila por hábito: nombre + 7 celdas */}
            {habits.map((h) => {
              const expanded = expandedId === h.id
              return (
                <Fragment key={h.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : h.id)}
                    title={h.name}
                    aria-label={`${h.name}. Tocar para ver el nombre completo.`}
                    className={`block w-full border-t border-gray-100 py-2 pr-1 text-left text-sm text-gray-800 ${
                      expanded ? 'whitespace-normal break-words' : 'truncate'
                    }`}
                  >
                    {h.name}
                  </button>
                  {days.map((d) => {
                    const cell = CELL[statusAt(h.id, d)]
                    const isToday = d === today
                    return (
                      <div
                        key={d}
                        className={`flex items-center justify-center border-l border-t border-gray-100 py-2 ${cell.className} ${
                          isToday ? 'ring-1 ring-inset ring-gray-200' : ''
                        }`}
                      >
                        <span aria-hidden="true">{cell.glyph}</span>
                        <span className="sr-only">{cell.label}</span>
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}
          </div>

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
