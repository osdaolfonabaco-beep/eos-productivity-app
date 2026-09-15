import ProgressRing from './ProgressRing'

/**
 * Anillo grande de progreso semanal, arriba del panel de Semana. Envoltorio
 * de `ProgressRing` (la técnica de dibujo y animación es genérica, ver ese
 * archivo) con el criterio propio de esta pantalla:
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
  const summary = hasData
    ? `${Math.round(weekPct)}% cumplido esta semana, ${totalHecho} de ${totalDias} registros hechos`
    : 'Sin registros todavía esta semana'

  return (
    <ProgressRing
      animKey={weekKey}
      pct={hasData ? weekPct : 0}
      hasArc={hasData}
      centerLabel={hasData ? undefined : '–'}
      ariaLabel={summary}
      caption={hasData ? `${totalHecho} de ${totalDias} registros hechos` : 'Sin registros todavía'}
    />
  )
}
