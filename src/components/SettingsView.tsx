import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { updatePasswordWrapping } from '../data/journalKey'
import { useJournalLock } from '../journalLock'
import { changePassword } from '../lib/journalCrypto'
import {
  applyBackup,
  clearLocalData,
  countAll,
  enablePushNotifications,
  exportAll,
  exportLocal,
  getPushPermission,
  getReminderTimes,
  getTone,
  hasActiveSubscription,
  isPushSupported,
  parseBackup,
  readLocalCounts,
  REMINDER_SLOT_COUNT,
  sendTestPush,
  setReminderSlot,
  setTone,
  todayISO,
  uploadLocalData,
  type BackupData,
  type CloudCounts,
  type ParsedBackup,
  type ReminderTimes,
  type TableReport,
  type Tone,
  type UploadReport,
} from '../data'
import { signOut } from '../data/supabase'
import { ActionError } from './ViewState'

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  {
    value: 'directo',
    label: 'Directo',
    description: 'Factual y sin adornos: empieza por lo que no funciona.',
  },
  {
    value: 'equilibrado',
    label: 'Equilibrado',
    description: 'Lo que funciona y lo que no, por igual. Por defecto.',
  },
  { value: 'breve', label: 'Breve', description: 'Dos o tres frases, solo lo esencial.' },
]

/** Etiqueta y valor de partida (solo para mostrar, no se guarda hasta que se toca) de cada slot. */
const REMINDER_SLOT_META = [
  { label: 'Primer recordatorio', placeholder: '08:00' },
  { label: 'Segundo recordatorio', placeholder: '20:00' },
]

/** Una fila de recordatorio: hora + "Desactivar" cuando ya hay una guardada. */
function ReminderSlotRow({
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  label: string
  placeholder: string
  value: string | null | undefined // undefined = cargando
  disabled: boolean
  onChange: (hora: string | null) => void
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-700">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          value={value ?? placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={value === undefined || disabled}
          aria-label={label}
          className="rounded-lg border border-gray-300 px-3 py-2 text-base disabled:opacity-60"
        />
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="text-sm font-medium text-gray-500 disabled:opacity-60"
          >
            Desactivar
          </button>
        )}
      </div>
      {value === null && (
        <p className="mt-1 text-xs text-gray-500">Desactivado. Elige una hora para activarlo.</p>
      )}
    </div>
  )
}

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

/** Las 16 colecciones del respaldo, en el mismo orden en que se muestran. */
const BACKUP_KEYS: (keyof BackupData)[] = [
  'habits',
  'entries',
  'debts',
  'payments',
  'ideas',
  'tasks',
  'journal',
  'weeklyGoals',
  'goalUpdates',
  'dayComments',
  'salaryPeriods',
  'fixedExpenses',
  'savingsGoals',
  'savingsContributions',
  'incomes',
  'expenses',
]

const BACKUP_LABELS: Record<keyof BackupData, [one: string, many: string]> = {
  habits: ['hábito', 'hábitos'],
  entries: ['registro', 'registros'],
  debts: ['deuda', 'deudas'],
  payments: ['pago', 'pagos'],
  ideas: ['idea', 'ideas'],
  tasks: ['tarea', 'tareas'],
  journal: ['nota del diario', 'notas del diario'],
  weeklyGoals: ['meta semanal', 'metas semanales'],
  goalUpdates: ['avance', 'avances'],
  dayComments: ['comentario del día', 'comentarios del día'],
  salaryPeriods: ['sueldo', 'sueldos'],
  fixedExpenses: ['gasto fijo', 'gastos fijos'],
  savingsGoals: ['meta de ahorro', 'metas de ahorro'],
  savingsContributions: ['aporte', 'aportes'],
  incomes: ['ingreso', 'ingresos'],
  expenses: ['gasto', 'gastos'],
}

/**
 * Una fila de la comparación "ahora vs. archivo" que se muestra antes de
 * reemplazar. `replaced` es `false` cuando el archivo no trae esta colección
 * (`present` no la incluye, ver el comentario grande en `parseBackup`): esa
 * tabla se deja tal cual está en la nube, así que `afterCount` es el mismo
 * `cloudCount`, no el (irrelevante) `data[key].length`, que sería 0.
 */
interface CompareRow {
  key: keyof BackupData
  /** Nombre en plural, para el encabezado de la fila (ej. "Ingresos"). */
  many: string
  cloudCount: number
  fileCount: number
  replaced: boolean
  afterCount: number
}

function compareRows(parsed: ParsedBackup, cloud: CloudCounts): CompareRow[] {
  return BACKUP_KEYS.map((key) => {
    const cloudCount = cloud[key]
    const replaced = parsed.present.has(key)
    const fileCount = parsed.data[key].length
    return {
      key,
      many: BACKUP_LABELS[key][1],
      cloudCount,
      fileCount,
      replaced,
      afterCount: replaced ? fileCount : cloudCount,
    }
  })
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
  parsed: ParsedBackup
  /** Lo que hay HOY en la nube, tabla por tabla, para comparar contra el archivo. */
  cloudCounts: CloudCounts
}

const JOURNAL_PW_MIN_LENGTH = 8

/**
 * Cambiar la contraseña del Journal. Usa `changePassword` (no toca la
 * envoltura de recuperación ni recifra notas) y solo funciona con la DEK ya
 * desenvuelta — si el Journal está bloqueado o sin configurar, explica por qué.
 */
function JournalPasswordSection() {
  const lock = useJournalLock()
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (lock.keyRecordStatus === 'loading') {
    return <p className="mt-3 text-sm text-gray-500">Cargando…</p>
  }
  if (lock.keyRecordStatus === 'error') {
    return <p className="mt-3 text-sm text-gray-500">No se pudo comprobar el cifrado del Journal.</p>
  }
  if (lock.keyRecord === null) {
    return (
      <p className="mt-3 text-sm text-gray-500">
        Aún no configuras el cifrado del Journal. Ve a Vida → Journal para crearlo.
      </p>
    )
  }
  if (lock.dek === null) {
    return (
      <p className="mt-3 text-sm text-gray-500">
        Desbloquea el Journal (Vida → Journal) para cambiar la contraseña.
      </p>
    )
  }

  const dek = lock.dek
  const keyId = lock.keyRecord.id
  const tooShort = newPassword.length > 0 && newPassword.length < JOURNAL_PW_MIN_LENGTH
  const mismatched = newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
  const canSubmit =
    newPassword.length >= JOURNAL_PW_MIN_LENGTH && newPassword === newPasswordConfirm && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const wrapping = await changePassword(dek, newPassword)
      const updated = await updatePasswordWrapping(keyId, wrapping)
      lock.setKeyRecord(updated)
      setNewPassword('')
      setNewPasswordConfirm('')
      setDone(true)
    } catch {
      setError('No se pudo cambiar la contraseña. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="settings-journal-pw">
          Contraseña nueva
        </label>
        <input
          id="settings-journal-pw"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
        />
        {tooShort && (
          <p className="mt-1 text-xs text-rose-600">Mínimo {JOURNAL_PW_MIN_LENGTH} caracteres.</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="settings-journal-pw2">
          Confirma la contraseña nueva
        </label>
        <input
          id="settings-journal-pw2"
          type="password"
          autoComplete="new-password"
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
        />
        {mismatched && <p className="mt-1 text-xs text-rose-600">No coincide.</p>}
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
      >
        {busy ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
      {done && <p className="text-sm text-gray-600">Contraseña cambiada.</p>}
      {error && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </form>
  )
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

  // La comparación "ahora vs. archivo" que se muestra antes de reemplazar.
  const pendingRows = pending ? compareRows(pending.parsed, pending.cloudCounts) : null
  const pendingTotals = pendingRows
    ? {
        before: pendingRows.reduce((sum, r) => sum + r.cloudCount, 0),
        after: pendingRows.reduce((sum, r) => sum + r.afterCount, 0),
      }
    : null

  // --- Copia local de este dispositivo ---
  const [localCounts, setLocalCounts] = useState(readLocalCounts)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const hasLocal =
    localCounts.habits + localCounts.entries + localCounts.debts + localCounts.payments > 0

  // --- Tono del análisis ---
  const [tone, setToneState] = useState<Tone | null>(null) // null = cargando
  const [toneBusy, setToneBusy] = useState(false)
  const [toneError, setToneError] = useState<string | null>(null)

  useEffect(() => {
    getTone()
      .then(setToneState)
      .catch(() => setToneState('equilibrado'))
  }, [])

  async function chooseTone(next: Tone) {
    if (next === tone || toneBusy) return
    setToneBusy(true)
    setToneError(null)
    try {
      await setTone(next)
      setToneState(next)
    } catch (err) {
      setToneError(err instanceof Error ? err.message : 'No se pudo guardar el tono.')
    } finally {
      setToneBusy(false)
    }
  }

  // --- Recordatorios diarios (dos, cada uno activable por separado) ---
  // undefined = cargando todavía.
  const [reminders, setRemindersState] = useState<ReminderTimes | undefined>(undefined)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderError, setReminderError] = useState<string | null>(null)

  useEffect(() => {
    getReminderTimes()
      .then(setRemindersState)
      .catch(() => setRemindersState({ horarios: [null, null], zonaHoraria: null }))
  }, [])

  async function updateReminderSlot(slot: number, hora: string | null) {
    setReminderBusy(true)
    setReminderError(null)
    try {
      await setReminderSlot(slot, hora)
      setRemindersState((prev) => {
        const horarios = [...(prev?.horarios ?? Array(REMINDER_SLOT_COUNT).fill(null))]
        horarios[slot] = hora
        return {
          horarios,
          zonaHoraria: hora !== null ? Intl.DateTimeFormat().resolvedOptions().timeZone : (prev?.zonaHoraria ?? null),
        }
      })
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : 'No se pudo guardar la hora.')
    } finally {
      setReminderBusy(false)
    }
  }

  // --- Notificaciones push (piezas 1 y 2: permiso + suscripción; sin la
  // tarea programada todavía) ---
  const [pushSupported] = useState(isPushSupported)
  const [pushPermission, setPushPermission] = useState(getPushPermission)
  const [pushActive, setPushActive] = useState<boolean | null>(null) // null = comprobando
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    hasActiveSubscription()
      .then(setPushActive)
      .catch(() => setPushActive(false))
  }, [])

  async function activatePush() {
    setPushBusy(true)
    setPushError(null)
    try {
      await enablePushNotifications()
      setPushActive(true)
      setPushPermission(getPushPermission())
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'No se pudo activar.')
    } finally {
      setPushBusy(false)
    }
  }

  async function testPush() {
    setPushBusy(true)
    setPushError(null)
    setTestResult(null)
    try {
      const { enviados, fallidos } = await sendTestPush()
      setTestResult(
        `Enviado a ${enviados} dispositivo${enviados === 1 ? '' : 's'}` +
          (fallidos ? `, ${fallidos} fallaron.` : '.'),
      )
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'No se pudo enviar la prueba.')
    } finally {
      setPushBusy(false)
    }
  }

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

    let rawJson: unknown
    try {
      rawJson = JSON.parse(await file.text())
    } catch {
      setImportError('El archivo no es JSON válido.')
      return
    }
    let parsed: ParsedBackup
    try {
      parsed = parseBackup(rawJson)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Respaldo no válido.')
      return
    }
    // Las cifras de la nube se piden aquí, no al abrir Ajustes: solo hacen
    // falta si de verdad hay un archivo que comparar contra ellas.
    try {
      const cloudCounts = await countAll()
      setPending({ fileName: file.name, parsed, cloudCounts })
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'No se pudieron leer los datos actuales de la nube.',
      )
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
      await applyBackup(pending.parsed)
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
      <h1 className="mb-6 mt-3 text-titulo">Ajustes</h1>

      {/* -------- Respaldo (nube) -------- */}
      <section>
        <h2 className="text-etiqueta uppercase etiqueta-calido">Respaldo</h2>
        <p className="mt-1 text-sm text-gray-500">
          Descarga una copia de tus datos en la nube, o reemplázalos con un archivo.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exportBusy}
            className="w-full rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            {exportBusy ? 'Exportando…' : 'Exportar datos'}
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full rounded-lg border border-gray-300 bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-gray-700 transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
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

        {pending && pendingRows && pendingTotals && (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4">
            <p className="text-sm font-medium text-gray-900">{pending.fileName}</p>
            <p className="mt-1 text-xs text-gray-500">
              Respaldo versión {pending.parsed.version}
              {pending.parsed.version < 2 && ' · de antes de que el respaldo cubriera Dinero'}
            </p>

            {/*
              Fila por fila: lo que hay hoy en la nube vs. lo que trae el
              archivo. Una fila sin "→" es una colección que el archivo no
              trae -- se deja tal cual está en la nube, no se toca (ver el
              comentario grande sobre `present` en parseBackup).
            */}
            <div className="mt-3 flex flex-col divide-y divide-rose-200 rounded-lg border border-rose-200 bg-white">
              {pendingRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                >
                  <span className="text-gray-700">{n(row.cloudCount, ...BACKUP_LABELS[row.key])}</span>
                  {row.replaced ? (
                    <span className="font-medium text-rose-700">
                      → {n(row.fileCount, ...BACKUP_LABELS[row.key])} del archivo
                    </span>
                  ) : (
                    <span className="text-gray-400">se conservan, no está en el archivo</span>
                  )}
                </div>
              ))}
            </div>

            <p className="mt-3 text-sm text-gray-700">
              En total: <strong>{pendingTotals.before}</strong> registros ahora en la nube →{' '}
              <strong>{pendingTotals.after}</strong> después de importar.
              {pendingTotals.after < pendingTotals.before && (
                <>
                  {' '}
                  <strong className="text-rose-700">
                    Se perderán {n(pendingTotals.before - pendingTotals.after, 'registro', 'registros')}
                  </strong>{' '}
                  que no están en el archivo.
                </>
              )}
            </p>

            <p className="mt-3 text-sm text-gray-700">
              Importar <strong>reemplaza en la nube las colecciones que trae este archivo</strong>.
              Las que no trae (marcadas arriba) se conservan tal cual. No se puede deshacer.
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
                    className="rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
                  >
                    {replaceBusy ? 'Reemplazando…' : 'Reemplazar'}
                  </button>
                  <button
                    type="button"
                    onClick={resetImport}
                    disabled={replaceBusy}
                    className="rounded-lg border border-gray-300 bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-gray-700 transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:border-transparent disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue"
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
          <h2 className="text-etiqueta uppercase etiqueta-calido">
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
              className="w-full rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
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
              className="w-full rounded-lg border border-gray-300 bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-gray-700 transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
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
                    className="rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
                  >
                    Borrar copia local
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="rounded-lg border border-gray-300 bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-gray-700 transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
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

      {/* -------- Tono del análisis -------- */}
      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-etiqueta uppercase etiqueta-calido">Tono del mentor</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cómo quieres que te hable el mentor sobre tus hábitos y tareas.
        </p>

        {toneError && (
          <div className="mt-3">
            <ActionError message={toneError} onDismiss={() => setToneError(null)} />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {TONE_OPTIONS.map((opt) => {
            const active = tone === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void chooseTone(opt.value)}
                disabled={tone === null || toneBusy}
                aria-pressed={active}
                className={`rounded-lg border px-4 py-3 text-left transition-[background-color,box-shadow] duration-[var(--dur-toque)] ease-toque ${
                  active
                    ? 'border-transparent bg-[image:var(--grad-secundario)] text-white shadow-[var(--sombra-acento)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none'
                    : 'border-gray-300 text-gray-700 disabled:opacity-60'
                }`}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className={`block text-xs ${active ? 'text-gray-300' : 'text-gray-500'}`}>
                  {opt.description}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* -------- Recordatorios diarios -------- */}
      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-etiqueta uppercase etiqueta-calido">Recordatorios diarios</h2>
        <p className="mt-1 text-sm text-gray-500">
          Hasta dos horas al día para un recordatorio de revisar tus hábitos, cada una
          activable por separado. Por ahora solo se guarda la hora; la notificación llega
          en un paso posterior.
        </p>

        {reminderError && (
          <div className="mt-3">
            <ActionError message={reminderError} onDismiss={() => setReminderError(null)} />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {REMINDER_SLOT_META.map((meta, slot) => (
            <ReminderSlotRow
              key={slot}
              label={meta.label}
              placeholder={meta.placeholder}
              value={reminders?.horarios[slot]}
              disabled={reminderBusy}
              onChange={(hora) => void updateReminderSlot(slot, hora)}
            />
          ))}
        </div>
      </section>

      {/* -------- Notificaciones push -------- */}
      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-etiqueta uppercase etiqueta-calido">Notificaciones push</h2>
        <p className="mt-1 text-sm text-gray-500">
          Por ahora solo el permiso y un aviso de prueba; el recordatorio automático a la
          hora de arriba llega en un paso posterior.
        </p>

        {pushError && (
          <div className="mt-3">
            <ActionError message={pushError} onDismiss={() => setPushError(null)} />
          </div>
        )}

        {!pushSupported ? (
          <p className="mt-4 text-sm text-gray-500">
            Este navegador no admite notificaciones push.
          </p>
        ) : pushPermission === 'denied' ? (
          <p className="mt-4 text-sm text-gray-500">
            Bloqueaste las notificaciones para esta app. Actívalas desde los ajustes del
            navegador para este sitio.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {!pushActive ? (
              <button
                type="button"
                onClick={() => void activatePush()}
                disabled={pushBusy}
                className="w-full rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
              >
                {pushBusy ? 'Activando…' : 'Activar notificaciones'}
              </button>
            ) : (
              <>
                <p className="text-sm text-gray-700">Activadas en este dispositivo.</p>
                <button
                  type="button"
                  onClick={() => void testPush()}
                  disabled={pushBusy}
                  className="w-full rounded-lg border border-gray-300 bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-gray-700 transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:border-transparent disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue"
                >
                  {pushBusy ? 'Enviando…' : 'Enviar aviso de prueba'}
                </button>
              </>
            )}
          </div>
        )}

        {testResult && <p className="mt-3 text-sm text-gray-600">{testResult}</p>}
      </section>

      {/* -------- Cifrado del Journal -------- */}
      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-etiqueta uppercase etiqueta-calido">Cifrado del Journal</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cambia la contraseña. No toca el código de recuperación ni vuelve a cifrar las
          notas ya guardadas.
        </p>
        <JournalPasswordSection />
      </section>

      {/* -------- Cuenta -------- */}
      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-etiqueta uppercase etiqueta-calido">Cuenta</h2>
        {email && <p className="mt-1 break-words text-sm text-gray-500">{email}</p>}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 rounded-lg border border-gray-300 bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-gray-700 transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}
