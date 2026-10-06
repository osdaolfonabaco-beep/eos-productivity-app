// Redacción de datos personales para las trazas de Langfuse.
//
// Funciones puras, sin Deno ni dependencias: las importa la Edge Function
// "analyze" (Deno) y también las pruebas de Vitest (Node). Nada de esto toca
// lo que se le manda a Gemini -- solo lo que sale hacia la traza.
//
// Tres niveles, de más a menos agresivo:
//   1. Nombres de deudas -> "Deuda 1", "Deuda 2"... (seudónimos estables
//      dentro de una misma petición, para que la salida del modelo se pueda
//      redactar con el mismo mapa).
//   2. Textos libres que escribe la persona (propósito, comentarios, metas,
//      ideas, propuestas, análisis anteriores) -> solo su longitud.
//   3. Todo lo demás (nombres de hábitos y tareas, categorías...) -> se deja
//      legible, pero con máscaras de correo, teléfono, URL y número largo, y
//      con los nombres de deudas cambiados por sus seudónimos.
// Números, booleanos y null nunca se tocan: los montos siguen intactos.

/** nombre real de la deuda -> seudónimo ("Deuda 1"...). */
export type DebtPseudonyms = Map<string, string>

/**
 * Rutas cuyo texto se reemplaza entero por su longitud. "*" es cualquier
 * índice de lista. Son los campos de texto libre de los payloads de
 * analyze/index.ts; un campo nuevo de ese estilo tiene que añadirse aquí.
 */
const PERSONAL_TEXT_PATHS = new Set([
  'proposito.objetivo',
  'proposito.plazo',
  'proposito.dificultad',
  'comentarioDelDia',
  'comentariosDeLaSemana.*.texto',
  'metas.*.texto',
  'metas.*.avances.*.texto',
  'metasSemanaAnterior.*.texto',
  'ideasCerradas.*.texto',
  'propuestaActiva.texto',
  'propuestasDescartadas.*.contenido',
  'ultimosAnalisis.*.contenido',
  // El texto de la idea en el tipo "idea" va en la raíz del payload.
  'texto',
])

const DEBT_NAME_PATH = 'dinero.deudas.*.nombre'

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu
// La URL no se come la puntuación final: "mira www.x.com." deja el punto.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)\]]/giu
// Con "+" delante, o grupos de dígitos separados por espacio, guion o
// paréntesis. El punto NO es separador, para no confundir montos como
// "1.500.000" con teléfonos. El conteo mínimo de dígitos y la exclusión de
// fechas se hacen en `maskPhone`.
const PHONE_RE =
  /(?<![\p{N}+])(?:\+\d[\d\s()-]*\d|\(?\d{2,4}\)?[\s-]\d{2,4}(?:[\s-]\d{2,5})+)(?!\p{N})/gu
const LONG_NUMBER_RE = /\d{9,}/g
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function maskPhone(match: string): string {
  // Las fechas YYYY-MM-DD tienen forma de teléfono y están por todo el payload.
  if (ISO_DATE_RE.test(match)) return match
  const digits = match.replace(/\D/g, '').length
  return digits >= 7 ? '[teléfono]' : match
}

/** Máscaras de correo, URL, teléfono y número largo, en ese orden para que no se pisen. */
function maskPatterns(text: string): string {
  return text
    .replace(EMAIL_RE, '[correo]')
    .replace(URL_RE, '[url]')
    .replace(PHONE_RE, maskPhone)
    .replace(LONG_NUMBER_RE, '[número]')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Cambia cada nombre real de deuda por su seudónimo. Sin distinguir
 * mayúsculas, solo palabras completas (con tildes: "Carro" no toca
 * "Carrocería"), y los nombres más largos primero para que "Visa" no rompa
 * "Visa Oro".
 */
function replaceDebtNames(text: string, seudonimos: DebtPseudonyms): string {
  const names = [...seudonimos.keys()].sort((a, b) => b.length - a.length)
  let out = text
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'giu')
    out = out.replace(re, seudonimos.get(name)!)
  }
  return out
}

/**
 * Redacta un texto libre que no viene del payload -- la respuesta del
 * modelo. Primero los seudónimos (un nombre de deuda con dígitos no debe
 * perderse en una máscara antes de cambiarse) y luego las máscaras.
 */
export function redactText(texto: string, seudonimos: DebtPseudonyms): string {
  return maskPatterns(replaceDebtNames(texto, seudonimos))
}

function personalTextMarker(s: string): string {
  // Caracteres reales, no unidades UTF-16: una tilde o un emoji cuentan 1.
  return `[texto personal: ${[...s].length} caracteres]`
}

function debtNamesOf(payload: unknown): string[] {
  const deudas = (payload as { dinero?: { deudas?: unknown } } | null)?.dinero?.deudas
  if (!Array.isArray(deudas)) return []
  return deudas.map((d) => (typeof d?.nombre === 'string' ? d.nombre : ''))
}

/**
 * Copia profunda del payload con las tres reglas de la cabecera aplicadas.
 * Nunca modifica el original (ese es el que va a Gemini). No falla con
 * payloads sin "dinero" ni "proposito": esas rutas simplemente no aparecen.
 */
export function redactPayload<T>(payload: T): { payload: T; seudonimos: DebtPseudonyms } {
  const names = debtNamesOf(payload)
  const seudonimos: DebtPseudonyms = new Map()
  names.forEach((name, i) => {
    // Si dos deudas se llaman igual, el mapa se queda con el primer seudónimo
    // (en el payload cada una conserva el suyo, por posición).
    if (name.trim() && !seudonimos.has(name)) seudonimos.set(name, `Deuda ${i + 1}`)
  })

  const walk = (value: unknown, path: string[]): unknown => {
    if (typeof value === 'string') {
      // "metas.2.avances.0.texto" -> "metas.*.avances.*.texto"
      const key = path.map((p) => (/^\d+$/.test(p) ? '*' : p)).join('.')
      if (key === DEBT_NAME_PATH) return `Deuda ${Number(path.at(-2)) + 1}`
      if (PERSONAL_TEXT_PATHS.has(key)) return personalTextMarker(value)
      return redactText(value, seudonimos)
    }
    if (Array.isArray(value)) return value.map((item, i) => walk(item, [...path, String(i)]))
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, [...path, k])
      return out
    }
    return value
  }

  return { payload: walk(payload, []) as T, seudonimos }
}
