import { formatCOP } from '../money'
import type { Income } from '../data'

/**
 * Paleta de categorías: tonos de marca, nunca verde/rojo de estado — una
 * categoría no es un estado. Se recicla si hay más de 3 categorías reales en
 * la misma quincena.
 */
const PALETTE = ['var(--color-acento)', 'var(--color-marca-cian)', 'var(--color-marca-menta)']
const SIN_CATEGORIA = 'Sin categoría'
const SIN_CATEGORIA_COLOR = 'var(--color-texto-tenue)'

interface CategorySlice {
  label: string
  amount: number
  color: string
}

/**
 * Bloque "De dónde vino": una sola barra horizontal partida por categoría de
 * los ingresos reales de la quincena (el sueldo no entra aquí, ya tiene su
 * propia línea en el bloque de arriba), con leyenda debajo. Con una sola
 * categoría (o ninguna) la barra no aporta nada frente a la cifra de arriba,
 * así que el bloque entero no se muestra.
 */
export default function IncomeCategoryBreakdown({ incomes }: { incomes: Income[] }) {
  const totals = new Map<string, number>()
  for (const income of incomes) {
    const key = income.category ?? SIN_CATEGORIA
    totals.set(key, (totals.get(key) ?? 0) + income.amount)
  }

  if (totals.size <= 1) return null

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  let brandIndex = 0
  const slices: CategorySlice[] = sorted.map(([label, amount]) => {
    if (label === SIN_CATEGORIA) return { label, amount, color: SIN_CATEGORIA_COLOR }
    const color = PALETTE[brandIndex % PALETTE.length]
    brandIndex++
    return { label, amount, color }
  })

  const total = slices.reduce((t, s) => t + s.amount, 0)

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">De dónde vino</h2>
      <div className="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Ingresos por categoría">
          {slices.map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${formatCOP(s.amount)}`}
              style={{ width: `${(s.amount / total) * 100}%`, backgroundColor: s.color }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 text-sm text-texto-cuerpo">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              <span className="tabular-nums text-texto-apagado">{formatCOP(s.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
