import { useEffect, useState } from 'react'

/**
 * `true` mientras la media query encaje; se re-renderiza cuando cambia (p. ej.
 * al girar el teléfono o redimensionar la ventana). Fuera del navegador
 * devuelve `false`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
