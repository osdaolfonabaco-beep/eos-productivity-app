import { formatCOP } from '../money'
import type { Expense, Income } from '../data'

/**
 * Paleta de categorías: tonos de marca, nunca verde/rojo de estado — una
 * categoría no es un estado, ni para un ingreso ni para un gasto. Tampoco
 * el violeta del acento: ese queda reservado para el sueldo. Se recicla si
 * hay más de 5 categorías reales en la misma barra.
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

/** Reparte un mapa de totales por etiqueta en franjas ordenadas de mayor a menor, coloreadas. */
function sliceify(totals: Map<string, number>): CategorySlice[] {
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  let brandIndex = 0
  return sorted.map(([label, amount]) => {
    if (label === SUELDO) return { label, amount, color: SUELDO_COLOR }
    if (label === SIN_CATEGORIA) return { label, amount, color: SIN_CATEGORIA_COLOR }
    const color = PALETTE[brandIndex % PALETTE.length]
    brandIndex++
    return { label, amount, color }
  })
}

/** El sueldo (sintético, si aplica) más los ingresos reales, agrupados por categoría. */
function buildIncomeSlices(incomes: Income[], salaryAmount: number): CategorySlice[] {
  const totals = new Map<string, number>()
  if (salaryAmount > 0) totals.set(SUELDO, salaryAmount)
  for (const income of incomes) {
    const key = income.category ?? SIN_CATEGORIA
    totals.set(key, (totals.get(key) ?? 0) + income.amount)
  }
  return sliceify(totals)
}

/** Los gastos reales agrupados por categoría. Sin sueldo: eso solo entra por el lado de ingresos. */
function buildExpenseSlices(expenses: Expense[]): CategorySlice[] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    const key = expense.category ?? SIN_CATEGORIA
    totals.set(key, (totals.get(key) ?? 0) + expense.amount)
  }
  return sliceify(totals)
}

/** Una barra horizontal partida por categoría, con su etiqueta y su leyenda en filas debajo. */
function CategoryBar({ title, slices }: { title: string; slices: CategorySlice[] }) {
  const total = slices.reduce((t, s) => t + s.amount, 0)
  if (total <= 0) return null

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-texto-cuerpo">{title}</h3>
      <div
        className="flex h-3 overflow-hidden rounded-full shadow-[var(--sombra-hundida)]"
        role="img"
        aria-label={title}
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
  )
}

/**
 * Bloque "Reparto por categoría": dos barras apiladas — de dónde vino el
 * dinero (con el sueldo incluido, sintético) y en qué se fue —, cada una
 * con su propia etiqueta y leyenda. Si una de las dos no tiene datos en
 * esta quincena, esa barra no se muestra; si ninguna tiene datos, el bloque
 * entero desaparece.
 */
export default function MovementCategoryBreakdown({
  incomes,
  expenses,
  salaryAmount,
}: {
  incomes: Income[]
  expenses: Expense[]
  salaryAmount: number
}) {
  const incomeSlices = buildIncomeSlices(incomes, salaryAmount)
  const expenseSlices = buildExpenseSlices(expenses)
  const hasIncome = incomeSlices.reduce((t, s) => t + s.amount, 0) > 0
  const hasExpense = expenseSlices.reduce((t, s) => t + s.amount, 0) > 0
  if (!hasIncome && !hasExpense) return null

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">Reparto por categoría</h2>
      <div className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-[var(--sombra-tarjeta)]">
        <CategoryBar title="De dónde vino" slices={incomeSlices} />
        {hasIncome && hasExpense && <div className="border-t-[0.5px] border-separador" />}
        <CategoryBar title="En qué se fue" slices={expenseSlices} />
      </div>
    </section>
  )
}
