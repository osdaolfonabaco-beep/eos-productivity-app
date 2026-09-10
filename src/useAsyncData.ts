import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

interface AsyncData<T> {
  /** Los datos, o `undefined` mientras no haya llegado la primera respuesta. */
  data: T | undefined
  /** `true` mientras hay una petición en curso (también en recargas). */
  loading: boolean
  /** Mensaje de la última petición que falló, o `null`. */
  error: string | null
  /** Vuelve a pedir los datos. */
  reload: () => void
  /** Parche local optimista: cambia `data` sin ir al servidor. */
  patch: (next: T | ((prev: T | undefined) => T)) => void
}

/**
 * Estandariza el patrón "cargar / cargando / error / reintentar" de las vistas.
 * Solo la última petición actualiza el estado (las anteriores se ignoran).
 *
 * `deps`: cuando cambian, se vuelve a pedir (p. ej. la semana en `WeekView`).
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
): AsyncData<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const reqId = useRef(0)

  const reload = useCallback(() => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    fetcherRef.current().then(
      (result) => {
        if (reqId.current === id) {
          setData(result)
          setLoading(false)
        }
      },
      (err: unknown) => {
        if (reqId.current === id) {
          setError(err instanceof Error ? err.message : 'Error de conexión')
          setLoading(false)
        }
      },
    )
  }, [])

  useEffect(() => {
    reload()
    return () => {
      // Al desmontar (o al cambiar deps), invalida la petición en curso.
      reqId.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps])

  const patch = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setData((prev) =>
      typeof next === 'function' ? (next as (p: T | undefined) => T)(prev) : next,
    )
  }, [])

  return { data, loading, error, reload, patch }
}
