/**
 * Acceso crudo a `localStorage`: el único sitio de todo el proyecto que lee y
 * escribe el almacenamiento. Lo usan `store.ts` (hábitos) y `finance.ts`
 * (deudas). El día que se cambie `localStorage` por una base de datos
 * sincronizada, es el archivo que hay que tocar.
 *
 * Ningún módulo guarda estado en memoria: cada lectura vuelve aquí, así que
 * `localStorage` es siempre la única fuente de verdad.
 */

/**
 * Lee la lista guardada bajo `key`. Si no hay nada, si el JSON está corrupto o
 * si `localStorage` no está disponible, devuelve `[]`.
 */
export function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/** Guarda `list` bajo `key`. Los errores (p. ej. cuota llena) se propagan. */
export function writeList<T>(key: string, list: T[]): void {
  localStorage.setItem(key, JSON.stringify(list))
}

export function newId(): string {
  return crypto.randomUUID()
}
