/** Formato y lectura de montos en pesos colombianos (enteros, sin centavos). */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

/** `4200000` → `"$ 4.200.000"`. */
export function formatCOP(amount: number): string {
  return COP.format(Math.round(amount))
}

/**
 * Lee lo que se escribe en un campo de monto y devuelve un entero de pesos, o
 * `null` si no hay ningún dígito. Ignora `$`, puntos, espacios y cualquier otro
 * caracter que no sea dígito.
 */
export function parsePesos(text: string): number | null {
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  return Number.parseInt(digits, 10)
}

/**
 * Lee un porcentaje (la tasa anual). Acepta coma o punto decimal. Devuelve un
 * número ≥ 0, o `null` si está vacío o no es válido.
 */
export function parseRate(text: string): number | null {
  const cleaned = text.trim().replace(',', '.').replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** `28.5` → `"28,5"`. Para mostrar una tasa con coma decimal. */
export function formatRate(rate: number): string {
  return String(rate).replace('.', ',')
}
