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
import { useMounted } from '../useMounted'
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

/** El aviso de privacidad: se queda en gris siempre. Ese color significa "sale hacia la IA" en el resto de la app; aquí es justo lo contrario. */
function PrivateNotice() {
  return (
    <p className="flex items-center gap-1.5 border-b-[0.5px] border-separador bg-[var(--color-menu-fondo)] px-3 py-2 text-xs font-medium text-texto-apagado">
      <PrivateIcon />
      Privado. Nunca se envía a ninguna IA.
    </p>
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

/** Navegación interna: lista, o editar una nota de hoy. Escribir una nota nueva ya no navega: es la tarjeta fija de "Hoy". */
type Screen = { name: 'list' } | { name: 'edit'; note: JournalNote }

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

/** Un texto de nota tal como se lee, o el aviso de que no se pudo descifrar. */
function NoteBody({ decoded, className = '' }: { decoded: DecodedText | undefined; className?: string }) {
  if (decoded?.failed) {
    return <p className={`text-meta italic text-fallado ${className}`}>No se pudo descifrar esta nota.</p>
  }
  return (
    <p className={`whitespace-pre-wrap break-words text-lectura text-texto-cuerpo ${className}`}>
      {decoded?.text ?? '…'}
    </p>
  )
}

/**
 * Una nota de hoy ya guardada: solo su texto, tocar para editarla. Sin
 * numeración ni etiqueta — si hay varias, la línea divisoria entre `<li>` la
 * separa (ver el `<ul>` que las contiene).
 */
function TodayNoteRow({ decoded, onEdit }: { decoded: DecodedText | undefined; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
    >
      <NoteBody decoded={decoded} />
    </button>
  )
}

/** Una nota de un día anterior: solo lectura, con archivar detrás del menú "⋯". */
function PastNote({
  decoded,
  onArchive,
}: {
  decoded: DecodedText | undefined
  onArchive: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="py-3">
        <NoteBody decoded={decoded} className="mb-2" />
        <div className="rounded-campo border border-borde bg-[var(--color-menu-fondo)] p-3">
          <p className="text-sm text-texto-cuerpo">Se archivará: sale de la lista, el texto se conserva.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onArchive}
              className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
            >
              Archivar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <NoteBody decoded={decoded} className="flex-1" />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Más acciones para esta nota"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          ⋯
        </button>
      </div>
      {menuOpen && (
        <div className="flex gap-4 pt-1">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setConfirming(true)
            }}
            className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Archivar
          </button>
        </div>
      )}
    </div>
  )
}

/** La tarjeta fija de "Hoy": el campo de escritura, siempre listo. */
function TodayComposer({
  prompt,
  busy,
  onSave,
}: {
  prompt: string | null
  busy: boolean
  onSave: (text: string) => void
}) {
  const [text, setText] = useState('')

  function save() {
    const clean = text.trim()
    if (!clean || busy) return
    onSave(clean)
    setText('')
  }

  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
      <PrivateNotice />
      <div className="p-3">
        {prompt && <p className="mb-2 text-sm italic text-texto-apagado">{prompt}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Escribe tu nota…"
          aria-label="Texto de la nota"
          disabled={busy}
          className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-lectura shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-60"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={!text.trim() || busy}
            className="rounded-campo bg-[image:var(--grad-calido)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-calido)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-calido-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            {busy ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * El editor de una nota de hoy ya existente: pantalla propia. El botón de
 * guardar aquí es sobrio a propósito — el violeta con relieve se reserva
 * para Desbloquear y Guardar nota, no para cada acción del Journal.
 */
function NoteEditor({
  initialText,
  busy,
  onSave,
  onCancel,
}: {
  initialText: string
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
    <main className="px-4 pb-6 pt-4 text-texto">
      <button type="button" onClick={onCancel} className="mb-3 text-sm text-texto-apagado">
        ‹ Volver
      </button>

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
        <PrivateNotice />
        <div className="p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            autoFocus
            placeholder="Escribe tu nota…"
            aria-label="Texto de la nota"
            className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-3 text-lectura shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!text.trim() || busy}
              className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-3 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-3 text-sm font-medium text-texto-apagado transition-[transform] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:border-transparent disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

/**
 * La lista de notas: la tarjeta fija de hoy arriba (con lo ya escrito hoy
 * debajo, tocar una para editarla), y debajo las de días anteriores, de solo
 * lectura, agrupadas por día.
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

  if (screen.name === 'edit') {
    const editing = screen.note
    return (
      <NoteEditor
        initialText={decoded[editing.id]?.text ?? ''}
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
    <main className="px-4 pb-6 pt-4 text-texto">
      {actionError && (
        <div className="mb-4">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      <section>
        <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Hoy · {formatLongDate(today)}</h2>
        <TodayComposer
          prompt={promptForDate(today)}
          busy={busy}
          onSave={(text) => void run(() => save(text, null), 'No se pudo guardar.')}
        />

        {todayNotes.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-separador rounded-tarjeta border border-borde bg-tarjeta px-3 shadow-[var(--sombra-tarjeta)]">
            {todayNotes.map((note) => (
              <li key={note.id}>
                <TodayNoteRow decoded={decoded[note.id]} onEdit={() => setScreen({ name: 'edit', note })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastDays.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-etiqueta uppercase text-texto-tenue">Entradas anteriores</h2>
          <ul className="flex flex-col gap-4">
            {pastDays.map((day) => (
              <li
                key={day.date}
                className="rounded-tarjeta border border-borde bg-tarjeta px-3 pt-3 shadow-[var(--sombra-tarjeta)]"
              >
                <p className="text-meta text-texto-apagado">{formatLongDate(day.date)}</p>
                <ul className="flex flex-col divide-y divide-separador">
                  {day.notes.map((note) => (
                    <li key={note.id}>
                      <PastNote
                        decoded={decoded[note.id]}
                        onArchive={() => void run(() => archiveNote(note.id), 'No se pudo archivar.')}
                      />
                    </li>
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
 * Transición de entrada tras un desbloqueo correcto: se desvanece desde 8px
 * más abajo. Solo se monta cuando `JournalUnlock` ya llamó a `onUnlocked` —
 * si la contraseña falla, este componente nunca existe, así que no hay nada
 * que animar.
 */
function JournalRevealed({ dek }: { dek: Uint8Array }) {
  const mounted = useMounted()
  return (
    <div
      className={`transition-[opacity,transform] duration-[var(--dur-entrada)] ease-salida ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <JournalNotes dek={dek} />
    </div>
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

  return <JournalRevealed dek={lock.dek} />
}
