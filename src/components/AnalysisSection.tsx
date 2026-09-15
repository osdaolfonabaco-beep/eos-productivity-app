import { useState } from 'react'
import { requestAnalysis } from '../data'
import { ActionError } from './ViewState'

/**
 * Pide un análisis breve de hábitos y tareas (Edge Function -> Gemini) y lo
 * muestra. No se guarda: se pierde al salir de la pantalla o recargar.
 */
export default function AnalysisSection() {
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setText(await requestAnalysis())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener el análisis.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="px-4 pt-6 text-texto">
      <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Análisis</h2>

      {error && <ActionError message={error} onDismiss={() => setError(null)} />}

      <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="w-full rounded-campo bg-acento px-4 py-3 text-sm font-semibold text-white shadow-[var(--sombra-principal)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.985] active:bg-[var(--color-acento-toque)] active:shadow-[var(--sombra-principal-toque)] disabled:opacity-40"
        >
          {busy ? 'Analizando…' : 'Pedir análisis'}
        </button>

        {text && (
          <p className="mt-3 whitespace-pre-wrap border-t-[0.5px] border-separador pt-3 text-texto-cuerpo">
            {text}
          </p>
        )}
      </div>
    </section>
  )
}
