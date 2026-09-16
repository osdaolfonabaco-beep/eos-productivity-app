import { useState, type FormEvent } from 'react'
import { signInWithEmail } from '../data/supabase'

type Status = 'idle' | 'sending' | 'sent' | 'error'

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Pantalla de inicio de sesión. Es lo único que se ve sin sesión.
 * Pide el correo y envía un enlace mágico; el enlace, al abrirse, inicia
 * la sesión y la app se muestra.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!looksLikeEmail(email)) return

    setStatus('sending')
    setError(null)

    const { error: sendError } = await signInWithEmail(email.trim())
    if (sendError) {
      setError(sendError.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  return (
    <main className="flex min-h-screen flex-col justify-center px-4 py-10 text-gray-900">
      <h1 className="text-2xl font-semibold">Eos</h1>

      {status === 'sent' ? (
        <div className="mt-4">
          <p className="text-sm text-gray-700">
            Te envié un enlace a <strong className="break-words">{email.trim()}</strong>.
            Ábrelo en este dispositivo para entrar.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus('idle')
              setError(null)
            }}
            className="mt-4 text-sm font-medium text-gray-600"
          >
            Usar otro correo
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">
            Entra con un enlace que te llega al correo.
          </p>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              aria-label="Correo"
              className="rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
            />
            <button
              type="submit"
              disabled={!looksLikeEmail(email) || status === 'sending'}
              className="rounded-lg bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
            >
              {status === 'sending' ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  )
}
