import { addDays, planningWindow } from '../data'

/** `Hoy`, `Mañana`, o el nombre del día ("Miércoles 17") para el resto de la ventana. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Hoy'
  if (iso === addDays(today, 1)) return 'Mañana'
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long', day: 'numeric' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface DayPickerProps {
  /** `null` = hoy. */
  value: string | null
  onChange: (value: string | null) => void
  today: string
  disabled?: boolean
  label: string
}

/**
 * Selector discreto de un día dentro de la ventana móvil de 7 días. `null`
 * (hoy) y las fechas de la ventana son las únicas opciones: fuera de ese
 * rango no se puede elegir nada, porque no se ofrece.
 */
export default function DayPicker({ value, onChange, today, disabled, label }: DayPickerProps) {
  const days = planningWindow(today)

  return (
    <select
      value={value ?? today}
      onChange={(e) => {
        const next = e.target.value
        onChange(next === today ? null : next)
      }}
      disabled={disabled}
      aria-label={label}
      className="shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700 disabled:opacity-60"
    >
      {days.map((d) => (
        <option key={d} value={d}>
          {dayLabel(d, today)}
        </option>
      ))}
    </select>
  )
}
