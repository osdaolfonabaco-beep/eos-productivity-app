import { formatCOP } from '../money'
import MovementQuincenaChart, { type MovementQuincenaTotal } from './MovementQuincenaChart'

interface MovementSummaryCardProps {
  entrada: number
  salida: number
  history: MovementQuincenaTotal[]
}

/**
 * Tarjeta de arriba de Movimientos, con sus dos zonas separadas por una
 * línea de 0.5px, igual que el resto de tarjetas de dos zonas de la app:
 *
 * - Zona superior: las tres cifras, sobre un lavado vertical neutro (ni
 *   verde ni rojo — la diferencia puede salir de cualquiera de los dos
 *   colores, así que el fondo no puede adelantar cuál). La diferencia es la
 *   cifra principal, arriba y más grande (`text-titulo`, el único tamaño de
 *   la escala mayor que `text-destacado`); entró y salió van debajo, más
 *   chicas y una junto a la otra.
 * - Zona inferior: el gráfico de barras dobles de las últimas 6 quincenas.
 */
export default function MovementSummaryCard({ entrada, salida, history }: MovementSummaryCardProps) {
  const diferencia = entrada - salida
  const negativa = diferencia < 0

  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
      <div
        className="p-4"
        style={{ background: 'linear-gradient(to bottom, var(--color-separador), var(--color-tarjeta))' }}
      >
        <h3 className="text-etiqueta uppercase etiqueta-calido">Diferencia</h3>
        <p
          className={`mt-1 text-titulo tabular-nums ${negativa ? 'text-fallado' : 'text-texto'}`}
        >
          {formatCOP(diferencia)}
        </p>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-etiqueta uppercase etiqueta-calido">Entró</h3>
            <p className="mt-1 text-destacado tabular-nums text-hecho">{formatCOP(entrada)}</p>
          </div>
          <div className="text-right">
            <h3 className="text-etiqueta uppercase etiqueta-calido">Salió</h3>
            <p className="mt-1 text-destacado tabular-nums text-fallado">{formatCOP(salida)}</p>
          </div>
        </div>
      </div>
      <div className="border-t-[0.5px] border-separador p-4">
        <MovementQuincenaChart history={history} />
      </div>
    </div>
  )
}
