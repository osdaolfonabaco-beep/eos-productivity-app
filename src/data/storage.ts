/**
 * Lo que queda de `localStorage` tras pasar a Supabase: solo lectura de la
 * copia local que había antes de la migración, más su borrado explícito.
 * Ninguna otra parte de la app escribe ya en `localStorage` los datos.
 */

/** Las claves donde vivían los datos antes de la nube. */
export const KEYS = {
  habits: 'productividad.habits',
  entries: 'productividad.entries',
  debts: 'productividad.debts',
  payments: 'productividad.payments',
} as const

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

/** Borra la copia local de los cuatro conjuntos de datos de este dispositivo. */
export function clearLocalData(): void {
  for (const key of Object.values(KEYS)) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* si localStorage no está disponible, no hay nada que borrar */
    }
  }
}

export function newId(): string {
  return crypto.randomUUID()
}
