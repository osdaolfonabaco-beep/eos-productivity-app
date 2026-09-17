import { useState, type FormEvent } from 'react'
import { insertJournalKey } from '../data/journalKey'
import type { JournalKey } from '../data/types'
import { createJournalKey, unlockWithPassword } from '../lib/journalCrypto'

const MIN_LENGTH = 8

type Strength = 'débil' | 'aceptable' | 'fuerte'

/** Heurística simple: longitud y variedad de caracteres. Ningún símbolo es obligatorio. */
function passwordStrength(password: string): Strength {
  let score = 0
  if (password.length >= MIN_LENGTH) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 1) return 'débil'
  if (score <= 3) return 'aceptable'
  return 'fuerte'
}

interface JournalSetupProps {
  onCreated: (key: JournalKey, dek: Uint8Array) => void
}

interface Created {
  key: JournalKey
  dek: Uint8Array
  recoveryCode: string
}

/**
 * Primera vez que se abre el Journal sin clave configurada: explica qué
 * implica cifrarlo, pide una contraseña y, tras crearla, obliga a guardar el
 * código de recuperación antes de continuar (se muestra una sola vez).
 */
export default function JournalSetup({ onCreated }: JournalSetupProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const [savedConfirmed, setSavedConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatched = confirm.length > 0 && password !== confirm
  const canSubmit = password.length >= MIN_LENGTH && password === confirm && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const { wrapping, recoveryCode } = await createJournalKey(password)
      const key = await insertJournalKey(wrapping)
      // Se acaba de envolver con esta misma contraseña: no puede fallar.
      const dek = await unlockWithPassword(password, key)
      if (!dek) throw new Error('unreachable')
      setCreated({ key, dek, recoveryCode })
    } catch {
      setError('No se pudo crear la clave del Journal. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <main className="px-4 pb-6 pt-4 text-gray-900">
        <h1 className="text-titulo">Guarda tu código de recuperación</h1>
        <p className="mt-2 text-sm text-gray-700">
          Este código se muestra <strong>una sola vez</strong>. Sin él y sin tu contraseña,
          las notas cifradas se pierden para siempre — nadie puede recuperarlas.
        </p>

        <div className="mt-4 rounded-xl border border-gray-300 bg-gray-50 p-4">
          <p className="select-all break-all font-mono text-lg leading-relaxed tracking-wide text-gray-900">
            {created.recoveryCode}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(created.recoveryCode)
              setCopied(true)
            }}
            className="mt-3 rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-800"
          >
            {copied ? 'Copiado' : 'Copiar código'}
          </button>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={savedConfirmed}
            onChange={(e) => setSavedConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          Ya lo guardé en un lugar seguro
        </label>

        <button
          type="button"
          onClick={() => onCreated(created.key, created.dek)}
          disabled={!savedConfirmed}
          className="mt-4 w-full rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
        >
          Continuar
        </button>
      </main>
    )
  }

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      <h1 className="text-titulo">Cifrar el Journal</h1>
      <p className="mt-2 text-sm text-gray-700">
        Tus notas se cifran en este dispositivo antes de guardarse: nadie más puede leerlas.
        Si olvidas la contraseña y pierdes el código de recuperación, las notas cifradas se
        pierden para siempre.
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="journal-setup-pw">
            Contraseña
          </label>
          <input
            id="journal-setup-pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
          />
          {password.length > 0 && !tooShort && (
            <p className="mt-1 text-xs text-gray-500">Fortaleza: {passwordStrength(password)}</p>
          )}
          {tooShort && <p className="mt-1 text-xs text-rose-600">Mínimo {MIN_LENGTH} caracteres.</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="journal-setup-pw2">
            Confirma la contraseña
          </label>
          <input
            id="journal-setup-pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
          />
          {mismatched && <p className="mt-1 text-xs text-rose-600">No coincide.</p>}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
        >
          {busy ? 'Creando…' : 'Crear clave del Journal'}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </main>
  )
}
