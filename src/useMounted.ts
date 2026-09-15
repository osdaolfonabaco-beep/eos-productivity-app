import { useLayoutEffect, useState } from 'react'

/**
 * `false` en el primer render, `true` un fotograma después. Sirve para animar
 * la entrada de algo: se pinta primero en su estado "sin entrar" (ej.
 * `scaleX(0)`, `opacity-0`) y en el siguiente fotograma se pasa al estado
 * final, lo que dispara la transición CSS en vez de aparecer ya en su
 * posición de destino.
 *
 * Con `prefers-reduced-motion: reduce` devuelve `true` desde el principio:
 * no hay "entrada" que animar, el elemento nace ya en su estado final. Se
 * usa `useLayoutEffect`, no `useEffect`, para que ese ajuste ocurra antes
 * de que el navegador pinte el primer fotograma — con `useEffect` (que
 * corre después de pintar) esa persona vería, aunque fuera un instante, la
 * barra o el anillo vacíos antes de la corrección; eso es justo lo que su
 * preferencia pide evitar.
 *
 * El componente que llama a este hook define qué cuenta como "montar": si
 * la animación debe esperar a que lleguen datos, se llama desde un
 * subcomponente que solo existe una vez que esos datos ya están (ver
 * `WeekGrid` en WeekView.tsx), no desde el componente contenedor que
 * monta antes, mientras carga.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(true)
      return
    }
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return mounted
}
