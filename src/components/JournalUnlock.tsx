import { useState, type FormEvent } from 'react'
import { updatePasswordWrapping } from '../data/journalKey'
import type { JournalKey } from '../data/types'
import { changePassword, unlockWithPassword, unlockWithRecovery } from '../lib/journalCrypto'

const MIN_LENGTH = 8

type Screen = 'password' | 'recovery' | 'new-password'

interface JournalUnlockProps {
  keyRecord: JournalKey
  onUnlocked: (dek: Uint8Array) => void
  /** Tras un desbloqueo por recuperación que fija una contraseña nueva: la fila queda distinta. */
  onPasswordChanged: (key: JournalKey) => void
}

/**
 * El Journal ya tiene clave configurada: pide la contraseña para desenvolver
 * la DEK. Incluye el rescate por código de recuperación, que obliga a fijar
 * una contraseña nueva antes de continuar.
 */
export default function JournalUnlock({ keyRecord, onUnlocked, onPasswordChanged }: JournalUnlockProps) {
  const [screen, setScreen] = useState<Screen>('password')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveredDek, setRecoveredDek] = useState<Uint8Array | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')

  function goTo(next: Screen) {
    setScreen(next)
    setError(null)
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      const dek = await unlockWithPassword(password, keyRecord)
      if (!dek) {
        setError('Contraseña incorrecta.')
        return
      }
      onUnlocked(dek)
    } finally {
      setBusy(false)
    }
  }

  async function submitRecovery(e: FormEvent) {
    e.preventDefault()
    if (!recoveryCode || busy) return
    setBusy(true)
    setError(null)
    try {
      const dek = await unlockWithRecovery(recoveryCode, keyRecord)
      if (!dek) {
        setError('Código de recuperación incorrecto.')
        return
      }
      setRecoveredDek(dek)
      goTo('new-password')
    } finally {
      setBusy(false)
    }
  }

  async function submitNewPassword(e: FormEvent) {
    e.preventDefault()
    if (!recoveredDek || busy) return
    if (newPassword.length < MIN_LENGTH || newPassword !== newPasswordConfirm) return
    setBusy(true)
    setError(null)
    try {
      const wrapping = await changePassword(recoveredDek, newPassword)
      const updated = await updatePasswordWrapping(keyRecord.id, wrapping)
      onPasswordChanged(updated)
      onUnlocked(recoveredDek)
    } catch {
      setError('No se pudo guardar la nueva contraseña. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (screen === 'recovery') {
    return (
      <main className="px-4 pb-6 pt-4 text-gray-900">
        <button type="button" onClick={() => goTo('password')} className="mb-3 text-sm text-gray-600">
          ‹ Volver
        </button>
        <h1 className="text-xl font-semibold">Desbloquear con el código de recuperación</h1>
        <p className="mt-2 text-sm text-gray-700">
          Pega el código que guardaste al configurar el cifrado. Después tendrás que fijar
          una contraseña nueva.
        </p>

        <form onSubmit={(e) => void submitRecovery(e)} className="mt-4 flex flex-col gap-3">
          <textarea
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            rows={2}
            autoFocus
            placeholder="XXXX-XXXX-XXXX-…"
            aria-label="Código de recuperación"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-3 font-mono text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
          />
          <button
            type="submit"
            disabled={!recoveryCode || busy}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Comprobando…' : 'Continuar'}
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

  if (screen === 'new-password') {
    const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH
    const mismatched = newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
    const canSubmit = newPassword.length >= MIN_LENGTH && newPassword === newPasswordConfirm && !busy

    return (
      <main className="px-4 pb-6 pt-4 text-gray-900">
        <h1 className="text-xl font-semibold">Fija una contraseña nueva</h1>
        <p className="mt-2 text-sm text-gray-700">
          El código de recuperación funcionó. Antes de continuar, elige una contraseña nueva
          para el Journal.
        </p>

        <form onSubmit={(e) => void submitNewPassword(e)} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="journal-new-pw">
              Contraseña nueva
            </label>
            <input
              id="journal-new-pw"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
            />
            {tooShort && <p className="mt-1 text-xs text-rose-600">Mínimo {MIN_LENGTH} caracteres.</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="journal-new-pw2">
              Confirma la contraseña nueva
            </label>
            <input
              id="journal-new-pw2"
              type="password"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
            />
            {mismatched && <p className="mt-1 text-xs text-rose-600">No coincide.</p>}
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar y continuar'}
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

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      <h1 className="text-xl font-semibold">Desbloquear el Journal</h1>
      <p className="mt-2 text-sm text-gray-700">Tus notas están cifradas. Escribe tu contraseña.</p>

      <form onSubmit={(e) => void submitPassword(e)} className="mt-4 flex flex-col gap-3">
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Contraseña del Journal"
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        />
        <button
          type="submit"
          disabled={!password || busy}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Comprobando…' : 'Desbloquear'}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => goTo('recovery')}
        className="mt-4 text-sm text-gray-500 underline decoration-dotted"
      >
        Olvidé mi contraseña
      </button>
    </main>
  )
}
