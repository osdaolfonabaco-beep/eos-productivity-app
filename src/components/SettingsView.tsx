import { useRef, useState, type ChangeEvent } from 'react'
import { applyBackup, exportAll, parseBackup, todayISO, type BackupData } from '../data'

interface SettingsViewProps {
  onClose: () => void
}

/** Descarga `data` como un archivo JSON con nombre `filename`. */
function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
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

export default function SettingsView({ onClose }: SettingsViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handleExport() {
    downloadJSON(`productividad-${todayISO()}.json`, exportAll())
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return

    setError(null)
    setPending(null)

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

  function replaceNow() {
    if (!pending) return
    setBusy(true)
    // Red de seguridad: baja un respaldo del estado actual antes de tocar nada.
    downloadJSON(`productividad-antes-de-importar-${todayISO()}.json`, exportAll())
    // Deja que la descarga arranque antes de reescribir y recargar.
    setTimeout(() => {
      applyBackup(pending.data)
      location.reload()
    }, 300)
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
              Antes de reemplazar se descargará un respaldo de tus datos actuales.
              Luego esto <strong>reemplaza todos tus datos</strong> (hábitos,
              registros, deudas y pagos) por los del archivo. No se puede deshacer.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={replaceNow}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? 'Restaurando…' : 'Reemplazar'}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
