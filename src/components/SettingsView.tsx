import { useRef, useState, type ChangeEvent } from 'react'
import { applyBackup, exportAll, parseBackup, todayISO, type BackupData } from '../data'
import { signOut } from '../data/supabase'

interface SettingsViewProps {
  onClose: () => void
  email: string | undefined
}

/**
 * Descarga `data` como un archivo JSON. Debe llamarse desde un gesto del
 * usuario (un click): el navegador solo garantiza una descarga programática
 * por gesto, así que nunca se encadenan dos.
 */
function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Solo limpieza de memoria; revocar de inmediato puede abortar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** `n(1, 'pago', 'pagos')` → `"1 pago"`. */
function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function summarize(data: BackupData): string {
  return [
    n(data.habits.length, 'hábito', 'hábitos'),
    n(data.entries.length, 'registro', 'registros'),
    n(data.debts.length, 'deuda', 'deudas'),
    n(data.payments.length, 'pago', 'pagos'),
  ].join(' · ')
}

interface Pending {
  fileName: string
  data: BackupData
}

export default function SettingsView({ onClose, email }: SettingsViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Puerta de seguridad de la importación: hay que bajar el respaldo actual
  // (paso propio) y confirmar que se guardó antes de poder reemplazar.
  const [safetyDownloaded, setSafetyDownloaded] = useState(false)
  const [safetyKept, setSafetyKept] = useState(false)
  const [busy, setBusy] = useState(false)

  function resetImport() {
    setPending(null)
    setError(null)
    setSafetyDownloaded(false)
    setSafetyKept(false)
    setBusy(false)
  }

  function handleExport() {
    downloadJSON(`productividad-${todayISO()}.json`, exportAll())
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return

    resetImport()

    let text: string
    try {
      text = await file.text()
    } catch {
      setError('No se pudo leer el archivo.')
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setError('El archivo no es JSON válido.')
      return
    }

    try {
      setPending({ fileName: file.name, data: parseBackup(parsed) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El archivo no es un respaldo válido.')
    }
  }

  /** Paso propio, su propio gesto: baja el estado actual antes de tocar nada. */
  function downloadSafetyBackup() {
    downloadJSON(`productividad-antes-de-importar-${todayISO()}.json`, exportAll())
    setSafetyDownloaded(true)
  }

  function replaceNow() {
    if (!pending || !safetyDownloaded || !safetyKept) return
    setBusy(true)
    applyBackup(pending.data)
    location.reload()
  }

  return (
    <main className="px-4 py-6 text-gray-900">
      <button type="button" onClick={onClose} className="text-sm text-gray-600">
        ‹ Volver
      </button>
      <h1 className="mb-6 mt-3 text-2xl font-semibold">Ajustes</h1>

      <section>
        <h2 className="text-sm font-semibold text-gray-700">Respaldo</h2>
        <p className="mt-1 text-sm text-gray-500">
          Guarda una copia de todos tus datos, o restaura desde un archivo.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white"
          >
            Exportar datos
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            Importar datos
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            hidden
          />
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {pending && (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4">
            <p className="text-sm font-medium text-gray-900">{pending.fileName}</p>
            <p className="mt-1 text-sm text-gray-600">{summarize(pending.data)}</p>
            <p className="mt-3 text-sm text-gray-700">
              Importar <strong>reemplaza todos tus datos</strong> (hábitos,
              registros, deudas y pagos) por los del archivo. No se puede deshacer.
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              <li className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-800">
                  1. Guarda un respaldo de lo que tienes ahora
                </span>
                <button
                  type="button"
                  onClick={downloadSafetyBackup}
                  className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 text-sm font-medium text-gray-800"
                >
                  {safetyDownloaded
                    ? 'Descargar respaldo otra vez'
                    : 'Descargar respaldo de mis datos actuales'}
                </button>
                {safetyDownloaded && (
                  <label className="flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={safetyKept}
                      onChange={(e) => setSafetyKept(e.target.checked)}
                      className="mt-0.5"
                    />
                    Ya guardé el respaldo en un sitio seguro
                  </label>
                )}
              </li>

              <li className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-800">
                  2. Reemplaza con el archivo importado
                </span>
                {!safetyKept && (
                  <span className="text-xs text-gray-500">
                    Disponible cuando confirmes el paso 1.
                  </span>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={replaceNow}
                    disabled={!safetyDownloaded || !safetyKept || busy}
                    className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {busy ? 'Restaurando…' : 'Reemplazar'}
                  </button>
                  <button
                    type="button"
                    onClick={resetImport}
                    disabled={busy}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </div>
              </li>
            </ol>
          </div>
        )}
      </section>

      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-700">Cuenta</h2>
        {email && <p className="mt-1 break-words text-sm text-gray-500">{email}</p>}
        <button
          type="button"
          onClick={() => {
            void signOut()
          }}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}
