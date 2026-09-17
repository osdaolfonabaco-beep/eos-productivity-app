import { useCallback, useState } from 'react'
import { getMentorSummary, updateMentorSummary } from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, Loading } from './ViewState'

/**
 * El resumen acumulado del mentor: la nota de memoria larga que reescribe
 * mirando los últimos análisis y las cifras calculadas -- nunca su propia
 * nota anterior (ver el comentario de cabecera de `updateMentorSummary`,
 * en `../data/analysis.ts`). Se actualiza sola al pedir un análisis
 * semanal; este botón es la vía manual, para cuando no se quiere esperar a
 * la próxima semana. Va en `MentorView`, en el sitio que hasta ahora era
 * solo un comentario reservado.
 */
export default function MentorSummarySection() {
  const fetcher = useCallback(() => getMentorSummary(), [])
  const { data: summary, loading, error, reload } = useAsyncData(fetcher)

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function update() {
    setBusy(true)
    setActionError(null)
    try {
      await updateMentorSummary()
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo actualizar el resumen.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !summary) return <Loading />
  // Igual que MentorPurposeSection: un fallo de carga aquí no bloquea el
  // resto de la pantalla, se trata como "todavía no hay resumen".
  if (error && !summary) return null

  return (
    <div className="px-4 pt-4">
      <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">Lo que lleva observado</h2>

      {actionError && (
        <div className="mb-2">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {summary ? (
        <p className="whitespace-pre-wrap rounded-tarjeta border border-borde bg-tarjeta p-3 text-lectura text-texto-cuerpo shadow-[var(--sombra-tarjeta)]">
          {summary.contenido}
        </p>
      ) : (
        <p className="rounded-tarjeta border border-dashed border-borde px-4 py-6 text-center text-texto-apagado">
          Todavía no hay un resumen. Se escribe solo al pedir un análisis semanal, o puedes generarlo ahora.
        </p>
      )}

      {/* Aguamarina: esta acción llama a la IA, mismo criterio que "Explicar mi semana" en WeekDashboard. */}
      <button
        type="button"
        onClick={() => void update()}
        disabled={busy}
        className="mt-2 rounded-campo bg-ia px-4 py-3 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-ia-texto)] disabled:bg-transparent disabled:text-texto-tenue"
      >
        {busy ? 'Actualizando…' : 'Actualizar resumen'}
      </button>
    </div>
  )
}
