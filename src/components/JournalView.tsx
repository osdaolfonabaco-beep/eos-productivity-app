import { useCallback, useEffect, useState } from 'react'
import {
  archiveNote,
  createNote,
  groupNotesByDate,
  listNotesBefore,
  listTodayNotes,
  promptForDate,
  todayISO,
  updateNoteContent,
  type JournalNote,
  type NoteContent,
} from '../data'
import { useJournalLock } from '../journalLock'
import { decryptNote, encryptNote } from '../lib/journalCrypto'
import { useAsyncData } from '../useAsyncData'
import JournalSetup from './JournalSetup'
import JournalUnlock from './JournalUnlock'
import { ActionError, LoadError, Loading } from './ViewState'

/** Candado: "esto se queda aquí". Contraste a propósito con el icono de DayCommentSection. */
function PrivateIcon() {
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
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/** `2026-09-08` → `Lunes, 8 de septiembre`. Solo para mostrar. */
function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Navegación interna: lista, escribir una nota nueva, o editar una de hoy. */
type Screen = { name: 'list' } | { name: 'compose' } | { name: 'edit'; note: JournalNote }

interface JournalData {
  today: JournalNote[]
  past: JournalNote[]
}

/** Lo que se descifró (o no) de una nota, para mostrarla. */
interface DecodedText {
  text: string
  /** `true` si la nota está cifrada y no se pudo descifrar (DEK equivocada o dato corrupto). */
  failed: boolean
}

/**
 * Resuelve el texto a mostrar de una nota: tal cual si no está cifrada, o
 * descifrado con la DEK si lo está. Nunca lanza — una nota que no se puede
 * descifrar se marca `failed`, no rompe el resto de la lista.
 */
async function decodeNoteText(note: JournalNote, dek: Uint8Array): Promise<DecodedText> {
  if (!note.encrypted) return { text: note.text ?? '', failed: false }
  if (!note.ciphertext || !note.iv) return { text: '', failed: true }
  const plain = await decryptNote(dek, note.ciphertext, note.iv)
  return plain === null ? { text: '', failed: true } : { text: plain, failed: false }
}

/** Una nota de un día anterior: solo lectura, con archivar en dos toques. */
function PastNote({
  label,
  decoded,
  onArchive,
}: {
  label: string
  decoded: DecodedText | undefined
  onArchive: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-sm font-medium text-gray-500"
          >
            Archivar
          </button>
        )}
      </div>
      {decoded?.failed ? (
        <p className="mt-1 text-sm italic text-rose-600">No se pudo descifrar esta nota.</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-gray-800">{decoded?.text ?? '…'}</p>
      )}

      {confirming && (
        <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm text-gray-700">
            Se archivará: sale de la lista, el texto se conserva.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onArchive}
              className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-medium text-white"
            >
              Archivar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * El editor: pantalla propia para escribir una nota nueva o cambiar el texto
 * de una de hoy. La pregunta sugerida solo aparece al crear, no al editar.
 */
function NoteEditor({
  initialText,
  prompt,
  busy,
  onSave,
  onCancel,
}: {
  initialText: string
  prompt: string | null
  busy: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)

  function save() {
    const clean = text.trim()
    if (!clean || busy) return
    onSave(clean)
  }

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      <button type="button" onClick={onCancel} className="mb-3 text-sm text-gray-600">
        ‹ Volver
      </button>

      {prompt && <p className="mb-2 text-sm italic text-gray-500">{prompt}</p>}

      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <PrivateIcon />
        Privado. Nunca se envía a ninguna IA.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        autoFocus
        placeholder="Escribe tu nota…"
        aria-label="Texto de la nota"
        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || busy}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </main>
  )
}

/**
 * La lista de notas de hoy (numeradas, tocar una para editarla) con un botón
 * para añadir, y debajo las de días anteriores, de solo lectura, agrupadas
 * por día y también numeradas.
 *
 * Solo se monta con la DEK ya desenvuelta (ver `JournalView` más abajo): toda
 * nota que se guarde aquí se guarda cifrada, cree una nueva o edite una vieja
 * que estuviera en claro — el texto en claro no debe salir hacia Supabase una
 * vez que el cifrado está activo.
 */
function JournalNotes({ dek }: { dek: Uint8Array }) {
  const today = todayISO()
  const [screen, setScreen] = useState<Screen>({ name: 'list' })

  const fetcher = useCallback(async (): Promise<JournalData> => {
    const [todayNotes, pastNotes] = await Promise.all([
      listTodayNotes(today),
      listNotesBefore(today),
    ])
    return { today: todayNotes, past: pastNotes }
  }, [today])

  const { data, loading, error, reload } = useAsyncData(fetcher, [today])

  // Texto descifrado por id de nota. Se recalcula cuando cambian los datos
  // cargados; una nota que aún no se resolvió simplemente no está en el mapa.
  const [decoded, setDecoded] = useState<Record<string, DecodedText>>({})
  useEffect(() => {
    if (!data) return
    let cancelled = false
    const notes = [...data.today, ...data.past]
    Promise.all(notes.map(async (note) => [note.id, await decodeNoteText(note, dek)] as const)).then(
      (entries) => {
        if (!cancelled) setDecoded(Object.fromEntries(entries))
      },
    )
    return () => {
      cancelled = true
    }
  }, [data, dek])

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, message: string, backToList = false) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      if (backToList) setScreen({ name: 'list' })
      reload()
    } catch {
      setActionError(message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Una nota nueva siempre nace cifrada. Editar una vieja NO la cifra si ya
   * estaba en texto: cifrarla es un acto deliberado (el migrador en lote que
   * falta), no un efecto secundario de tocarla — mientras no exista ese
   * migrador, las notas en texto son la única vía de recuperación si algo
   * sale mal con la clave, y no queremos ir cerrando esa vía nota por nota.
   */
  async function save(text: string, editing: JournalNote | null) {
    if (editing && !editing.encrypted) {
      const content: NoteContent = { text, ciphertext: null, iv: null, encrypted: false }
      await updateNoteContent(editing.id, content)
      return
    }
    const { ciphertext, iv } = await encryptNote(dek, text)
    const content: NoteContent = { text: null, ciphertext, iv, encrypted: true }
    if (editing) await updateNoteContent(editing.id, content)
    else await createNote(today, content)
  }

  if (screen.name === 'compose' || screen.name === 'edit') {
    const editing = screen.name === 'edit' ? screen.note : null
    return (
      <NoteEditor
        initialText={editing ? (decoded[editing.id]?.text ?? '') : ''}
        prompt={editing ? null : promptForDate(today)}
        busy={busy}
        onCancel={() => setScreen({ name: 'list' })}
        onSave={(text) => void run(() => save(text, editing), 'No se pudo guardar.', true)}
      />
    )
  }

  if (loading && !data) return <Loading />
  if (error && !data) return <LoadError onRetry={reload} />

  const todayNotes = data?.today ?? []
  const pastDays = groupNotesByDate(data?.past ?? [])

  return (
    <main className="px-4 pb-6 pt-4 text-gray-900">
      {actionError && (
        <ActionError message={actionError} onDismiss={() => setActionError(null)} />
      )}

      <button
        type="button"
        onClick={() => setScreen({ name: 'compose' })}
        className="mb-6 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white"
      >
        + Nueva nota
      </button>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Hoy</h2>
        {todayNotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500">
            Aún no has anotado nada hoy.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {todayNotes.map((note, i) => {
              const d = decoded[note.id]
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setScreen({ name: 'edit', note })}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left"
                  >
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Nota {i + 1}
                    </p>
                    {d?.failed ? (
                      <p className="text-sm italic text-rose-600">No se pudo descifrar esta nota.</p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-gray-900">{d?.text ?? '…'}</p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {pastDays.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Entradas anteriores</h2>
          <ul className="flex flex-col gap-4">
            {pastDays.map((day) => (
              <li key={day.date} className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  {formatLongDate(day.date)}
                </p>
                <ul className="flex flex-col gap-3">
                  {day.notes.map((note, i) => (
                    <PastNote
                      key={note.id}
                      label={`Nota ${i + 1}`}
                      decoded={decoded[note.id]}
                      onArchive={() => void run(() => archiveNote(note.id), 'No se pudo archivar.')}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

/**
 * Vida → Journal. Antes de mostrar nada, resuelve el candado: sin clave
 * configurada ofrece crearla, con clave pero sin desbloquear pide la
 * contraseña, y solo con la DEK en memoria muestra las notas.
 */
export default function JournalView() {
  const lock = useJournalLock()

  if (lock.keyRecordStatus === 'loading') return <Loading />
  if (lock.keyRecordStatus === 'error') return <LoadError onRetry={lock.reloadKeyRecord} />

  if (lock.keyRecord === null) {
    return (
      <JournalSetup
        onCreated={(key, dek) => {
          lock.setKeyRecord(key)
          lock.unlock(dek)
        }}
      />
    )
  }

  if (lock.dek === null) {
    return (
      <JournalUnlock
        keyRecord={lock.keyRecord}
        onUnlocked={lock.unlock}
        onPasswordChanged={lock.setKeyRecord}
      />
    )
  }

  return <JournalNotes dek={lock.dek} />
}
