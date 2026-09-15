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
 * El monograma de Eos: los dos arcos del icono de la app (sin el fondo de
 * degradado), en `currentColor`. Puramente decorativo — cierre de
 * composición de la pantalla de desbloqueo, nunca portador de significado.
 */
function EosMonogram() {
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32" fill="none" stroke="currentColor" aria-hidden="true">
      <g transform="translate(7,0) skewX(-8)">
        <path d="M 41.91 26.88 A 23.12 23.12 0 0 0 41.91 73.12" strokeWidth={11.56} strokeLinecap="round" />
        <path d="M 58.09 26.88 A 23.12 23.12 0 0 1 58.09 73.12" strokeWidth={11.56} strokeLinecap="round" />
      </g>
    </svg>
  )
}

/**
 * Aviso de error. La regla de "un solo color, el violeta" es para estados de
 * cumplimiento (el Journal no tiene); un error sigue en --color-fallado,
 * sobre todo aquí, donde es la única señal de que la contraseña no fue
 * aceptada.
 */
function FieldError({ children }: { children: string }) {
  return (
    <p className="rounded-tarjeta border border-fallado/30 bg-fallado-suave px-4 py-3 text-sm text-fallado">
      {children}
    </p>
  )
}

const campoClase =
  'w-full rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-4 py-4 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento'

const botonAcentoClase =
  'rounded-campo bg-acento px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-acento-toque)] active:shadow-[var(--sombra-acento-toque)] disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none'

/** Botón principal sobrio: para las pantallas de recuperación, no invita a pulsarlo. */
const botonSobrioClase =
  'rounded-campo bg-texto px-4 py-3 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue'

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
      <main className="px-4 pb-6 pt-4 text-texto">
        <button type="button" onClick={() => goTo('password')} className="mb-3 text-sm text-texto-apagado">
          ‹ Volver
        </button>
        <h1 className="text-titulo">Desbloquear con el código de recuperación</h1>
        <p className="mt-2 text-contenido text-texto-cuerpo">
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
            className={`${campoClase} resize-none font-mono`}
          />
          <button type="submit" disabled={!recoveryCode || busy} className={botonSobrioClase}>
            {busy ? 'Comprobando…' : 'Continuar'}
          </button>
        </form>

        {error && (
          <div className="mt-4">
            <FieldError>{error}</FieldError>
          </div>
        )}
      </main>
    )
  }

  if (screen === 'new-password') {
    const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH
    const mismatched = newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
    const canSubmit = newPassword.length >= MIN_LENGTH && newPassword === newPasswordConfirm && !busy

    return (
      <main className="px-4 pb-6 pt-4 text-texto">
        <h1 className="text-titulo">Fija una contraseña nueva</h1>
        <p className="mt-2 text-contenido text-texto-cuerpo">
          El código de recuperación funcionó. Antes de continuar, elige una contraseña nueva
          para el Journal.
        </p>

        <form onSubmit={(e) => void submitNewPassword(e)} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-texto-cuerpo" htmlFor="journal-new-pw">
              Contraseña nueva
            </label>
            <input
              id="journal-new-pw"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={campoClase}
            />
            {tooShort && <p className="mt-1 text-xs text-fallado">Mínimo {MIN_LENGTH} caracteres.</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-texto-cuerpo" htmlFor="journal-new-pw2">
              Confirma la contraseña nueva
            </label>
            <input
              id="journal-new-pw2"
              type="password"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className={campoClase}
            />
            {mismatched && <p className="mt-1 text-xs text-fallado">No coincide.</p>}
          </div>
          <button type="submit" disabled={!canSubmit} className={botonSobrioClase}>
            {busy ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>

        {error && (
          <div className="mt-4">
            <FieldError>{error}</FieldError>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="flex min-h-[75vh] flex-col px-4 pb-6 pt-4 text-texto">
      <h1 className="text-titulo">Desbloquear el Journal</h1>
      <p className="mt-2 text-contenido text-texto-cuerpo">Lo que escribas aquí es solo tuyo.</p>

      <form onSubmit={(e) => void submitPassword(e)} className="mt-4 flex flex-col gap-3">
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Contraseña del Journal"
          className={campoClase}
        />
        <button type="submit" disabled={!password || busy} className={botonAcentoClase}>
          {busy ? 'Comprobando…' : 'Desbloquear'}
        </button>
      </form>

      {error && (
        <div className="mt-3">
          <FieldError>{error}</FieldError>
        </div>
      )}

      <button
        type="button"
        onClick={() => goTo('recovery')}
        className="mt-4 text-sm text-texto-apagado underline decoration-dotted"
      >
        Olvidé mi contraseña
      </button>

      <div className="mt-auto flex justify-center pt-10 text-texto-tenue opacity-30">
        <EosMonogram />
      </div>
    </main>
  )
}
