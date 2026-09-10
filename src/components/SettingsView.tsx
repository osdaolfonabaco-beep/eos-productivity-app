import { useRef, useState, type ChangeEvent } from 'react'
import {
  applyBackup,
  clearLocalData,
  exportAll,
  exportLocal,
  parseBackup,
  readLocalCounts,
  todayISO,
  uploadLocalData,
  type BackupData,
  type TableReport,
  type UploadReport,
} from '../data'
import { signOut } from '../data/supabase'
import { ActionError } from './ViewState'

interface SettingsViewProps {
  onClose: () => void
  email: string | undefined
}

/**
 * Descarga `data` como JSON. Se llama desde un gesto del usuario: el navegador
 * solo garantiza una descarga programática por gesto.
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
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** `n(1, 'pago', 'pagos')` → `"1 pago"`. */
function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function summarizeData(data: BackupData): string {
  return [
    n(data.habits.length, 'hábito', 'hábitos'),
    n(data.entries.length, 'registro', 'registros'),
    n(data.debts.length, 'deuda', 'deudas'),
    n(data.payments.length, 'pago', 'pagos'),
  ].join(' · ')
}

function summarizeCounts(c: ReturnType<typeof readLocalCounts>): string {
  return [
    n(c.habits, 'hábito', 'hábitos'),
    n(c.entries, 'registro', 'registros'),
    n(c.debts, 'deuda', 'deudas'),
    n(c.payments, 'pago', 'pagos'),
  ].join(' · ')
}

function reportLine(label: string, r: TableReport): string {
  if (r.localTotal === 0) return `${label}: 0 (no hay en este dispositivo)`
  const parts = [`subidos ${r.uploaded}`, `ya estaban ${r.alreadyThere}`]
  if (r.skipped) parts.push(`omitidos ${r.skipped}`)
  return `${label}: ${parts.join(', ')}`
}

interface Pending {
  fileName: string
  data: BackupData
}

export default function SettingsView({ onClose, email }: SettingsViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)

  // --- Exportar / importar (nube) ---
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [pending, setPending] = useState<Pending | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [safetyDownloaded, setSafetyDownloaded] = useState(false)
  const [safetyKept, setSafetyKept] = useState(false)
  const [replaceBusy, setReplaceBusy] = useState(false)

  // --- Copia local de este dispositivo ---
  const [localCounts, setLocalCounts] = useState(readLocalCounts)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const hasLocal =
    localCounts.habits + localCounts.entries + localCounts.debts + localCounts.payments > 0

  function resetImport() {
    setPending(null)
    setImportError(null)
    setSafetyDownloaded(false)
    setSafetyKept(false)
    setReplaceBusy(false)
  }

  async function handleExport() {
    setExportBusy(true)
    setExportError(null)
    try {
      downloadJSON(`productividad-${todayISO()}.json`, await exportAll())
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar.')
    } finally {
      setExportBusy(false)
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return
    resetImport()

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setImportError('El archivo no es JSON válido.')
      return
    }
    try {
      setPending({ fileName: file.name, data: parseBackup(parsed) })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Respaldo no válido.')
    }
  }

  async function downloadSafetyBackup() {
    try {
      downloadJSON(`productividad-antes-de-importar-${todayISO()}.json`, await exportAll())
      setSafetyDownloaded(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo descargar el respaldo.')
    }
  }

  async function replaceNow() {
    if (!pending || !safetyDownloaded || !safetyKept) return
    setReplaceBusy(true)
    try {
      await applyBackup(pending.data)
      location.reload()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo reemplazar.')
      setReplaceBusy(false)
    }
  }

  async function upload() {
    setUploadBusy(true)
    setUploadError(null)
    setUploadReport(null)
    try {
      setUploadReport(await uploadLocalData())
    } catch (err) {
      setUploadError(
        (err instanceof Error ? err.message : 'Falló la subida.') +
          ' La subida es aditiva; puedes reintentar.',
      )
    } finally {
      setUploadBusy(false)
    }
  }

  function clearLocal() {
    clearLocalData()
    setLocalCounts(readLocalCounts())
    setConfirmingClear(false)
    setUploadReport(null)
  }

  return (
    <main className="px-4 py-6 text-gray-900">
      <button type="button" onClick={onClose} className="text-sm text-gray-600">
        ‹ Volver
      </button>
      <h1 className="mb-6 mt-3 text-2xl font-semibold">Ajustes</h1>

      {/* -------- Respaldo (nube) -------- */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700">Respaldo</h2>
        <p className="mt-1 text-sm text-gray-500">
          Descarga una copia de tus datos en la nube, o reemplázalos con un archivo.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exportBusy}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {exportBusy ? 'Exportando…' : 'Exportar datos'}
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
            onChange={(e) => void handleFile(e)}
            hidden
          />
        </div>

        {exportError && (
          <div className="mt-3">
            <ActionError message={exportError} onDismiss={() => setExportError(null)} />
          </div>
        )}
        {importError && !pending && (
          <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {importError}
          </p>
        )}

        {pending && (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4">
            <p className="text-sm font-medium text-gray-900">{pending.fileName}</p>
            <p className="mt-1 text-sm text-gray-600">{summarizeData(pending.data)}</p>
            <p className="mt-3 text-sm text-gray-700">
              Importar <strong>reemplaza todos tus datos de la nube</strong> por los del
              archivo. No se puede deshacer.
            </p>

            {importError && (
              <p className="mt-3 text-sm font-medium text-rose-700">{importError}</p>
            )}

            <ol className="mt-4 flex flex-col gap-3">
              <li className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-800">
                  1. Guarda un respaldo de lo que hay ahora en la nube
                </span>
                <button
                  type="button"
                  onClick={() => void downloadSafetyBackup()}
                  className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 text-sm font-medium text-gray-800"
                >
                  {safetyDownloaded
                    ? 'Descargar respaldo otra vez'
                    : 'Descargar respaldo de la nube'}
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
                    onClick={() => void replaceNow()}
                    disabled={!safetyDownloaded || !safetyKept || replaceBusy}
                    className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {replaceBusy ? 'Reemplazando…' : 'Reemplazar'}
                  </button>
                  <button
                    type="button"
                    onClick={resetImport}
                    disabled={replaceBusy}
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

      {/* -------- Copia local de este dispositivo -------- */}
      {hasLocal && (
        <section className="mt-8 border-t border-gray-200 pt-6">
          <h2 className="text-sm font-semibold text-gray-700">
            Datos de este dispositivo
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Quedan datos guardados en este dispositivo de antes de la nube.
          </p>
          <p className="mt-2 text-sm text-gray-700">
            En este dispositivo: {summarizeCounts(localCounts)}.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void upload()}
              disabled={uploadBusy}
              className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              {uploadBusy ? 'Subiendo…' : 'Subir a la nube'}
            </button>
            <p className="text-xs text-gray-500">
              Añade lo que falte; no borra ni cambia lo que ya esté en la nube.
            </p>

            <button
              type="button"
              onClick={() =>
                downloadJSON(`productividad-local-${todayISO()}.json`, exportLocal())
              }
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
            >
              Descargar copia local
            </button>
          </div>

          {uploadError && (
            <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {uploadError}
            </p>
          )}

          {uploadReport && (
            <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-gray-700">
              <p className="font-medium text-gray-900">Subida completada.</p>
              <ul className="mt-1 list-none space-y-0.5">
                <li>{reportLine('Hábitos', uploadReport.habits)}</li>
                <li>{reportLine('Registros', uploadReport.entries)}</li>
                <li>{reportLine('Deudas', uploadReport.debts)}</li>
                <li>{reportLine('Pagos', uploadReport.payments)}</li>
              </ul>
            </div>
          )}

          <div className="mt-4">
            {confirmingClear ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
                <p className="text-sm text-gray-700">
                  Borra la copia de este dispositivo. Lo que esté en la nube no se toca.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={clearLocal}
                    className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white"
                  >
                    Borrar copia local
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="text-sm font-medium text-gray-500"
              >
                Borrar copia local de este dispositivo
              </button>
            )}
          </div>
        </section>
      )}

      {/* -------- Cuenta -------- */}
      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-700">Cuenta</h2>
        {email && <p className="mt-1 break-words text-sm text-gray-500">{email}</p>}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}
