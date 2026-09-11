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
    <section className="px-4 pt-6 text-gray-900">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Análisis</h2>

      {error && <ActionError message={error} onDismiss={() => setError(null)} />}

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-40"
      >
        {busy ? 'Analizando…' : 'Pedir análisis'}
      </button>

      {text && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-white p-3 text-gray-800">
          {text}
        </p>
      )}
    </section>
  )
}
