import { useId, useLayoutEffect, useState, type ReactNode } from 'react'

/**
 * Los mismos puntos que --ease-salida en index.css. Mantener en sync si ese
 * token cambia — se duplica aquí porque CSS no expone sus propios
 * cubic-bezier como números que JS pueda leer.
 */
const EASE_SALIDA: [number, number, number, number] = [0.32, 0.72, 0, 1]

/** Debe coincidir con --dur-entrada en index.css (JS no puede leer ms de un token CSS). */
const DUR_ENTRADA_MS = 320

/**
 * Evalúa un cubic-bezier(x1,y1,x2,y2) en el instante t (0..1), igual que lo
 * haría una transición CSS con esa curva. Newton-Raphson: busca el
 * parámetro `u` de la curva cuya coordenada X es t, y devuelve su Y (el
 * avance real, ya con la aceleración de la curva aplicada).
 *
 * Se usa para que el número del centro cuente exactamente al mismo ritmo
 * que dibuja el arco: un solo bucle de animación mueve los dos a la vez,
 * en vez de una transición CSS para el arco y un intervalo JS aparte para
 * el número, que podrían desincronizarse un fotograma entre sí.
 */
function bezierEase(t: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u
  const sampleXDerivative = (u: number) => (3 * ax * u + 2 * bx) * u + cx

  let u = t
  for (let i = 0; i < 8; i++) {
    const x = sampleX(u) - t
    const d = sampleXDerivative(u)
    if (Math.abs(x) < 1e-5 || d === 0) break
    u -= x / d
  }
  return sampleY(u)
}

const SIZE = 160
const CENTER = SIZE / 2
const RADIUS = 60
const STROKE = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface ProgressRingProps {
  /** Cambiar esta clave reinicia y vuelve a disparar la animación de entrada. */
  animKey: string
  /** Porcentaje real (0-100). Siempre es el dato mostrado, incluso en 0. */
  pct: number
  /**
   * Si se dibuja el arco de color. Por defecto `pct > 0`: en 0% no hay arco
   * que dibujar, y con extremo redondeado un arco de longitud casi nula se
   * vería como un hueco o un punto suelto sobre el círculo base — mejor no
   * dibujarlo y dejar el círculo base limpio.
   */
  hasArc?: boolean
  /** Sustituye el `pct%` del centro (ej. "–" cuando no hay dato que mostrar). */
  centerLabel?: string
  /** Texto bajo el anillo. */
  caption: ReactNode
  ariaLabel: string
}

/**
 * Anillo circular de progreso, con degradado de `--color-acento` a
 * `--color-hecho`. El arco se dibuja desde cero hasta `pct` al montar (o
 * cuando cambia `animKey`), animando en conjunto el trazo del arco y el
 * número del centro. Generalizado a partir del anillo semanal original
 * (ver `WeekProgressRing`, que ahora es un envoltorio de este componente)
 * para que Deudas pueda mostrar su propio porcentaje con la misma técnica.
 */
export default function ProgressRing({
  animKey,
  pct,
  hasArc = pct > 0,
  centerLabel,
  caption,
  ariaLabel,
}: ProgressRingProps) {
  const gradientId = useId()
  const [progress, setProgress] = useState(0)

  // `useLayoutEffect`, no `useEffect`: con reduced motion, corrige el
  // progreso a su valor final antes del primer pintado, así quien pidió no
  // ver movimiento tampoco ve, ni un instante, el anillo vacío.
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1)
      return
    }
    setProgress(0)
    let raf = 0
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min(1, (now - start) / DUR_ENTRADA_MS)
      setProgress(bezierEase(t, EASE_SALIDA))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey])

  const shownPct = Math.round(pct * progress)
  // Sin arco: el offset queda en la circunferencia completa (arco invisible,
  // solo se ve el círculo base) en vez de animar hacia un valor que no se
  // quiere dibujar.
  const offset = hasArc ? CIRCUMFERENCE * (1 - (pct / 100) * progress) : CIRCUMFERENCE

  return (
    <div className="rounded-tarjeta border border-borde bg-tarjeta p-6 shadow-[var(--sombra-tarjeta)]">
      <div
        className="mx-auto flex w-fit items-center justify-center rounded-full"
        style={{
          // Sombra suave de color bajo el arco, mismo criterio que --sombra-acento.
          boxShadow: '0 14px 32px -10px rgba(123, 90, 240, 0.35)',
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-acento)" />
              <stop offset="100%" stopColor="var(--color-hecho)" />
            </linearGradient>
          </defs>
          {/* Círculo base: siempre completo y limpio, incluso a 0%. El arco de encima es lo único que crece o falta. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--color-separador)"
            strokeWidth={STROKE}
          />
          {hasArc && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              aria-hidden="true"
            />
          )}
          <text
            x={CENTER}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-destacado tabular-nums"
            fill="var(--color-texto)"
            aria-hidden="true"
          >
            {centerLabel ?? `${shownPct}%`}
          </text>
        </svg>
      </div>
      <p className="mt-2 text-center text-meta text-texto-apagado" aria-hidden="true">
        {caption}
      </p>
    </div>
  )
}
