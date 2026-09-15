import { useLayoutEffect, useState } from 'react'

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

/**
 * Anillo grande de progreso semanal, arriba del panel de Semana. El arco se
 * dibuja desde cero hasta `weekPct` al montar (o cuando cambia `weekKey`,
 * es decir, la semana mostrada), animando en conjunto el trazo del arco y
 * el número del centro. No se recalcula en otros re-renders del padre
 * (ej. al pedir la explicación de IA): la animación solo depende de
 * `weekKey`, no de `weekPct` en sí.
 *
 * `totalDias === 0` (todavía no ha pasado ningún día con hábitos activos)
 * es un caso distinto de "0% cumplido": no hay dato que mostrar, así que
 * se pinta el anillo base vacío con un guion, nunca un 0% que sugeriría
 * que sí se pudo responder y no se hizo.
 */
export default function WeekProgressRing({
  weekKey,
  weekPct,
  totalHecho,
  totalDias,
}: {
  weekKey: string
  weekPct: number
  totalHecho: number
  totalDias: number
}) {
  const hasData = totalDias > 0
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
  }, [weekKey])

  const shownPct = hasData ? Math.round(weekPct * progress) : 0
  // Sin datos: el offset queda en la circunferencia completa (arco invisible,
  // solo se ve el círculo base) en vez de animar hacia un 0% inventado.
  const offset = hasData ? CIRCUMFERENCE * (1 - (weekPct / 100) * progress) : CIRCUMFERENCE

  const summary = hasData
    ? `${shownPct}% cumplido esta semana, ${totalHecho} de ${totalDias} registros hechos`
    : 'Sin registros todavía esta semana'

  return (
    <div className="rounded-tarjeta border border-borde bg-tarjeta p-6 shadow-[var(--sombra-tarjeta)]">
      <div
        className="mx-auto flex w-fit items-center justify-center rounded-full"
        style={{
          // Sombra suave de color bajo el arco, mismo criterio que --sombra-acento.
          boxShadow: '0 14px 32px -10px rgba(123, 90, 240, 0.35)',
        }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={summary}
        >
          <defs>
            <linearGradient id="anillo-semana-gradiente" x1="0%" y1="0%" x2="100%" y2="100%">
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
          {hasData && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="url(#anillo-semana-gradiente)"
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
            {hasData ? `${shownPct}%` : '–'}
          </text>
        </svg>
      </div>
      <p className="mt-2 text-center text-meta text-texto-apagado" aria-hidden="true">
        {hasData ? `${totalHecho} de ${totalDias} registros hechos` : 'Sin registros todavía'}
      </p>
    </div>
  )
}
