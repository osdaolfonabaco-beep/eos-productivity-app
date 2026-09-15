import { useState } from 'react'

interface HabitManageRowProps {
  name: string
  /** Renombra el hábito. Ya viene recortado y no vacío. */
  onRename: (name: string) => void
  /** Archiva el hábito: sale de las listas activas, su historial se conserva. */
  onArchive: () => void
}

/** Los tres modos en los que puede estar una fila. */
type Mode = 'view' | 'edit' | 'confirm-archive'

/**
 * Una fila de la pantalla "Hábitos".
 *
 * Guarda su propio modo: normal (nombre + menú "⋯"), edición en línea
 * (campo + Guardar + Cancelar) y confirmación de archivado (aviso +
 * Archivar + Cancelar). No conoce el módulo de datos: avisa con `onRename` /
 * `onArchive`.
 */
export default function HabitManageRow({ name, onRename, onArchive }: HabitManageRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(name)
  const [menuOpen, setMenuOpen] = useState(false)

  function startEdit() {
    setDraft(name)
    setMode('edit')
  }

  function save() {
    const clean = draft.trim()
    if (!clean) return
    onRename(clean)
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="px-3 py-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          aria-label="Nuevo nombre del hábito"
          className="w-full rounded-campo border border-borde px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-campo bg-texto px-4 py-2 text-sm font-medium text-tarjeta transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-texto-toque)] disabled:bg-transparent disabled:text-texto-tenue"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-archive') {
    return (
      <div className="px-3 py-3">
        <p className="break-words text-contenido font-medium text-texto">{name}</p>
        <p className="mt-1 text-sm text-texto-apagado">Se archivará. El historial se conserva.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onArchive}
            className="rounded-campo bg-acento px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-[var(--color-acento-toque)]"
          >
            Archivar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="rounded-campo px-4 py-2 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 break-words text-contenido text-texto-cuerpo">{name}</span>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Más acciones para este hábito"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div className="flex gap-4 px-3 pb-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              startEdit()
            }}
            className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setMode('confirm-archive')
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
