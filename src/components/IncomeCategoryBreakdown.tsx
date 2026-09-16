import { formatCOP } from '../money'
import type { Income } from '../data'

/**
 * Paleta de categorías: tonos de marca, nunca verde/rojo de estado — una
 * categoría no es un estado. Tampoco el violeta del acento: ese queda
 * reservado para el sueldo (ver más abajo). Se recicla si hay más de 5
 * categorías reales en la misma quincena.
 */
const PALETTE = [
  'var(--color-marca-cian)',
  'var(--color-marca-menta)',
  'var(--color-marca-ambar)',
  'var(--color-marca-azul)',
  'var(--color-marca-magenta)',
]
const SIN_CATEGORIA = 'Sin categoría'
// Fijo, fuera de la rotación — igual que el sueldo. "Sin categoría" no es
// una categoría real, es la ausencia de una: si tomara un color de la
// paleta, parecería una más.
const SIN_CATEGORIA_COLOR = 'var(--color-texto-tenue)'
const SUELDO = 'Sueldo'
// También fijo y fuera de la rotación: el sueldo es el ingreso de mayor
// peso casi siempre, se lee mejor con un color propio y constante.
const SUELDO_COLOR = 'var(--color-acento)'

interface CategorySlice {
  label: string
  amount: number
  color: string
}

/** Degradado vertical más claro arriba, más oscuro abajo — mismo color base. */
function verticalGradient(color: string): string {
  return `linear-gradient(to bottom, color-mix(in srgb, ${color} 100%, white 20%), color-mix(in srgb, ${color} 100%, black 12%))`
}

/**
 * Bloque "De dónde vino": una sola barra horizontal partida por categoría,
 * con el sueldo (sintético, calculado al leer — nunca se guarda en
 * `incomes`) como un segmento más junto a las categorías de los ingresos
 * reales de la quincena. Con leyenda debajo. Se muestra siempre que haya
 * algo que repartir (sueldo o al menos un ingreso), aunque sea un único
 * segmento.
 */
export default function IncomeCategoryBreakdown({
  incomes,
  salaryAmount,
}: {
  incomes: Income[]
  salaryAmount: number
}) {
  const totals = new Map<string, number>()
  if (salaryAmount > 0) totals.set(SUELDO, salaryAmount)
  for (const income of incomes) {
    const key = income.category ?? SIN_CATEGORIA
    totals.set(key, (totals.get(key) ?? 0) + income.amount)
  }

  const total = [...totals.values()].reduce((t, v) => t + v, 0)
  if (total <= 0) return null

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  let brandIndex = 0
  const slices: CategorySlice[] = sorted.map(([label, amount]) => {
    if (label === SUELDO) return { label, amount, color: SUELDO_COLOR }
    if (label === SIN_CATEGORIA) return { label, amount, color: SIN_CATEGORIA_COLOR }
    const color = PALETTE[brandIndex % PALETTE.length]
    brandIndex++
    return { label, amount, color }
  })

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">De dónde vino</h2>
      <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
        <div
          className="flex h-3 overflow-hidden rounded-full shadow-[var(--sombra-hundida)]"
          role="img"
          aria-label="Ingresos por categoría"
        >
          {slices.map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${formatCOP(s.amount)}`}
              style={{ width: `${(s.amount / total) * 100}%`, background: verticalGradient(s.color) }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-texto-cuerpo">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-texto-apagado">
                {formatCOP(s.amount)} · {Math.round((s.amount / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
