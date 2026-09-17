import { useCallback, useState } from 'react'
import {
  MENTOR_PURPOSE_LIMITS,
  confirmMentorPurposeReviewed,
  deleteMentorPurpose,
  getMentorPurpose,
  isMentorPurposeStale,
  saveMentorPurpose,
  type MentorPurpose,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, Loading } from './ViewState'

/** Flecha saliente: "esto se va de aquí". Mismo icono que `DayCommentSection`, duplicado a mano como el resto de iconos de la app. */
function SentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7M17 7H9M17 7V15" />
    </svg>
  )
}

type Mode = 'view' | 'edit' | 'confirm-delete'

interface Draft {
  objetivo: string
  plazo: string
  dificultad: string
}

const EMPTY_DRAFT: Draft = { objetivo: '', plazo: '', dificultad: '' }

/** Los tres campos, en el orden en que se muestran y se editan siempre. */
const FIELDS: { key: keyof Draft; label: string; kind: 'textarea' | 'input' }[] = [
  { key: 'objetivo', label: 'Qué estás intentando lograr', kind: 'textarea' },
  { key: 'plazo', label: 'En qué plazo', kind: 'input' },
  { key: 'dificultad', label: 'Qué te está costando', kind: 'textarea' },
]

/** El contador de caracteres restantes, solo cuando queda poco margen. */
function RemainingCount({ value, limit }: { value: string; limit: number }) {
  const remaining = limit - value.length
  if (remaining >= 100) return null
  return <p className="mt-1 text-meta text-texto-tenue">{remaining} caracteres restantes</p>
}

/**
 * El "para qué" del mentor: qué está intentando lograr el usuario, en qué
 * plazo y qué le está costando. Se muestra arriba del todo en `MentorView`,
 * antes del resumen de actividad -- es lo primero que se lee al entrar,
 * porque es lo que le da sentido a todo lo demás en la pantalla.
 *
 * Autocontenido, igual que `DayCommentSection`: lee y escribe directamente
 * contra `./mentorPurpose`, sin recibir datos por props.
 */
export default function MentorPurposeSection() {
  const fetcher = useCallback(() => getMentorPurpose(), [])
  const { data: purpose, loading, error, reload } = useAsyncData(fetcher)

  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function startEdit(current: MentorPurpose | undefined) {
    setDraft({
      objetivo: current?.objetivo ?? '',
      plazo: current?.plazo ?? '',
      dificultad: current?.dificultad ?? '',
    })
    setActionError(null)
    setMode('edit')
  }

  async function save() {
    setBusy(true)
    setActionError(null)
    try {
      await saveMentorPurpose(draft)
      reload()
      setMode('view')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmReviewed(id: string) {
    setBusy(true)
    setActionError(null)
    try {
      await confirmMentorPurposeReviewed(id)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo confirmar.')
    } finally {
      setBusy(false)
    }
  }

  async function doDelete(id: string) {
    setBusy(true)
    setActionError(null)
    try {
      await deleteMentorPurpose(id)
      reload()
      setMode('view')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo borrar.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !purpose) return <Loading />
  // Un fallo de carga aquí no impide usar el resto de la pantalla: se
  // trata como "todavía no hay propósito" en vez de bloquear con
  // `LoadError`, que sí tiene sentido en pantallas donde no hay nada más
  // que mostrar sin esos datos.
  if (error && !purpose) return null

  return (
    <div className="px-4 pt-4">
      <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">Para qué estoy en esto</h2>

      {actionError && (
        <div className="mb-2">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {mode === 'edit' ? (
        <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
          <p
            className="flex items-center gap-1.5 border-b-[0.5px] border-separador px-3 py-2 text-xs font-medium text-ia-texto"
            style={{
              background:
                'linear-gradient(90deg, var(--color-ia-suave), color-mix(in srgb, var(--color-ia-suave) 55%, white))',
            }}
          >
            <SentIcon />
            Este texto se envía a la IA en cada análisis del mentor (diario y semanal).
          </p>

          <div className="flex flex-col gap-3 p-3">
            {FIELDS.map(({ key, label, kind }) => {
              const limit = MENTOR_PURPOSE_LIMITS[key]
              const value = draft[key]
              const commonClassName =
                'w-full rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60'
              return (
                <div key={key}>
                  <label htmlFor={`mentor-purpose-${key}`} className="mb-1 block text-meta text-texto-tenue">
                    {label}
                  </label>
                  {kind === 'textarea' ? (
                    <textarea
                      id={`mentor-purpose-${key}`}
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      rows={3}
                      maxLength={limit}
                      disabled={busy}
                      className={`${commonClassName} resize-y`}
                    />
                  ) : (
                    <input
                      id={`mentor-purpose-${key}`}
                      type="text"
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      maxLength={limit}
                      disabled={busy}
                      className={commonClassName}
                    />
                  )}
                  <RemainingCount value={value} limit={limit} />
                </div>
              )
            })}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setMode('view')}
                disabled={busy}
                className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : !purpose ? (
        <div className="rounded-tarjeta border border-dashed border-borde px-4 py-6 text-center">
          <p className="text-texto-apagado">
            Escribe qué estás intentando lograr para que el mentor relacione lo que observa con eso, en vez de
            describir los datos sueltos.
          </p>
          <button
            type="button"
            onClick={() => startEdit(undefined)}
            className="mt-3 rounded-campo bg-[image:var(--grad-calido)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-calido)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-calido-toque)]"
          >
            Escribir mi propósito
          </button>
        </div>
      ) : mode === 'confirm-delete' ? (
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
          <p className="text-sm text-texto-apagado">Se borrará. No se puede deshacer.</p>
          <div className="mt-2 flex gap-2">
            {/*
             * Único borrado real de toda la app: en cualquier otro sitio
             * "confirmar" significa archivar (se puede recuperar, el
             * historial no se pierde). Aquí sí se destruye la fila. Por eso
             * este botón, y solo este, lleva el tratamiento de
             * --color-fallado en vez del --grad-secundario que usa el resto
             * de confirmaciones (Archivar, Marcar como hecha) -- si algún
             * día esto se "unifica" con esos por consistencia visual, se
             * pierde la única señal que distingue un borrado de un archivado.
             */}
            <button
              type="button"
              onClick={() => void doDelete(purpose.id)}
              disabled={busy}
              className="rounded-campo bg-fallado-suave px-4 py-2 text-sm font-medium text-fallado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-60"
            >
              {busy ? 'Borrando…' : 'Borrar'}
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              disabled={busy}
              className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          {isMentorPurposeStale(purpose) && (
            <div className="mb-2 rounded-tarjeta border border-borde px-3 py-2">
              <p className="text-sm text-texto-apagado">Lleva más de un mes sin revisarse. ¿Sigue vigente?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirmReviewed(purpose.id)}
                  disabled={busy}
                  className="rounded-campo bg-[image:var(--grad-secundario)] px-3 py-1.5 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
                >
                  Sigue vigente
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(purpose)}
                  disabled={busy}
                  className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-3 py-1.5 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-60"
                >
                  Editar
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
            <div className="flex items-start justify-between gap-2 p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {purpose.objetivo && (
                  <div>
                    <p className="text-meta text-texto-tenue">Qué estás intentando lograr</p>
                    <p className="text-lectura text-texto-cuerpo">{purpose.objetivo}</p>
                  </div>
                )}
                {purpose.plazo && (
                  <div>
                    <p className="text-meta text-texto-tenue">En qué plazo</p>
                    <p className="text-lectura text-texto-cuerpo">{purpose.plazo}</p>
                  </div>
                )}
                {purpose.dificultad && (
                  <div>
                    <p className="text-meta text-texto-tenue">Qué te está costando</p>
                    <p className="text-lectura text-texto-cuerpo">{purpose.dificultad}</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-label="Más acciones para el propósito"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              >
                ⋯
              </button>
            </div>

            {menuOpen && (
              <div className="flex gap-2 border-t-[0.5px] border-separador bg-[var(--color-menu-fondo)] px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    startEdit(purpose)
                  }}
                  className="rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
                >
                  Editar
                </button>
                {/* Mismo tratamiento --color-fallado que el botón de confirmar, y por la misma razón: es el único borrado real, no un archivado. */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setMode('confirm-delete')
                  }}
                  className="rounded-pastilla bg-fallado-suave px-3 py-1.5 text-sm font-medium text-fallado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-pastilla-toque)]"
                >
                  Borrar
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
