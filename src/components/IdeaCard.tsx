import { useState } from 'react'
import type { Idea, IdeaStatus } from '../data'

export const STATUSES: { value: IdeaStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en-marcha', label: 'En marcha' },
  { value: 'descartada', label: 'Descartada' },
  { value: 'hecha', label: 'Hecha' },
]

/**
 * Todo lo que cambia de un estado de idea a otro, en un solo sitio.
 *
 * `stripe` es el color de la franja izquierda de 3px de la tarjeta; ancho
 * siempre igual (se fija en el contenedor), transparente en pendiente y
 * descartada para que las tarjetas no queden desalineadas entre sí.
 *
 * `pillActive` es el relleno de la pastilla de este estado cuando está
 * seleccionada en el selector segmentado. 'pendiente' y 'descartada' no son
 * un color de marca ni de resultado -- se rellenan en blanco con el mismo
 * relieve que una pastilla de acción (`--sombra-pastilla`), para leerse
 * como "elegida" sin inventarles un color que no significa nada. El violeta
 * de 'en-marcha' es el de "lo activo" en toda la app; el verde de 'hecha' es
 * el de "cumplido" -- ninguno de los dos se presta a otra cosa (por eso el
 * botón de CONFIRMAR "marcar como hecha" en `IdeaCard` no usa este verde:
 * confirmar es una acción, no el estado en sí).
 *
 * `textClass` es el color del cuerpo de la idea; `wash`, el lavado de fondo
 * de la tarjeta entera (solo 'hecha' lo lleva).
 */
const STATUS_META: Record<
  IdeaStatus,
  { label: string; stripe: string; pillActive: string; textClass: string; wash?: string }
> = {
  pendiente: {
    label: 'Pendiente',
    stripe: 'border-l-transparent',
    pillActive: 'bg-tarjeta text-texto-cuerpo shadow-[var(--sombra-pastilla)]',
    textClass: 'text-texto-cuerpo',
  },
  'en-marcha': {
    label: 'En marcha',
    stripe: 'border-l-acento',
    pillActive: 'bg-[image:var(--grad-secundario)] text-white shadow-[var(--sombra-acento)]',
    textClass: 'text-texto-cuerpo',
  },
  hecha: {
    label: 'Hecha',
    stripe: 'border-l-hecho',
    pillActive: 'bg-[image:var(--grad-hecho)] text-white shadow-[var(--sombra-hecho)]',
    textClass: 'text-texto-apagado',
    wash: 'linear-gradient(90deg, var(--color-hecho-lavado), transparent 42%)',
  },
  descartada: {
    label: 'Descartada',
    stripe: 'border-l-transparent',
    pillActive: 'bg-tarjeta text-texto-tenue shadow-[var(--sombra-pastilla)]',
    textClass: 'text-texto-tenue',
  },
}

/** Clase de la pastilla activa, para reusar en la fila de solo lectura de archivadas. */
export const STATUS_ACTIVE_CLASS: Record<IdeaStatus, string> = Object.fromEntries(
  STATUSES.map((s) => [s.value, STATUS_META[s.value].pillActive]),
) as Record<IdeaStatus, string>

/** El resultado de pedir el análisis de IA de esta idea, o `undefined` si nunca se pidió. */
export type IdeaAnalysisState = { text: string } | { error: string }

interface IdeaCardProps {
  idea: Idea
  onSetStatus: (status: IdeaStatus) => void
  onSaveText: (text: string) => void
  onArchive: () => void
  /** `true` mientras se espera la respuesta del análisis de ESTA idea. */
  analyzing: boolean
  /** `true` si hay otra idea analizándose ahora mismo (solo una a la vez). */
  analyzeDisabled: boolean
  analysisResult: IdeaAnalysisState | undefined
  onAnalyze: () => void
}

type Mode = 'view' | 'edit' | 'confirm-archive' | 'confirm-hecha'

/**
 * Una idea en la lista: texto, el selector segmentado de los cuatro estados,
 * "Editar"/"Archivar" detrás del menú "⋯", y (si no está descartada) la
 * banda de análisis con IA al pie.
 *
 * Marcar como 'hecha' pide confirmación de dos toques, igual que archivar
 * (y de hecho archiva: ver `setIdeaStatus`) -- las demás pastillas cambian
 * el estado al primer toque, como siempre. Los dos botones de confirmar
 * usan `--grad-secundario`: el color de estado (verde de "hecha", rojo de
 * "no hecho" en otras pantallas) nunca se presta a la acción que lleva a él.
 */
export default function IdeaCard({
  idea,
  onSetStatus,
  onSaveText,
  onArchive,
  analyzing,
  analyzeDisabled,
  analysisResult,
  onAnalyze,
}: IdeaCardProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(idea.text)
  const [menuOpen, setMenuOpen] = useState(false)

  function startEdit() {
    setDraft(idea.text)
    setMode('edit')
  }

  function save() {
    const clean = draft.trim()
    if (!clean) return
    onSaveText(clean)
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          aria-label="Texto de la idea"
          className="w-full resize-y rounded-campo border border-[var(--color-campo-borde)] bg-[var(--color-campo)] px-3 py-2 text-base shadow-[var(--sombra-hundida)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(idea.text)
              setMode('view')
            }}
            className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  const meta = STATUS_META[idea.status]
  const discarded = idea.status === 'descartada'

  return (
    <div
      className={`overflow-hidden rounded-tarjeta border border-borde border-l-[3px] bg-tarjeta shadow-[var(--sombra-tarjeta)] transition-colors duration-[var(--dur-estado)] ease-salida ${meta.stripe}`}
      style={meta.wash ? { background: meta.wash } : undefined}
    >
      {mode === 'confirm-archive' ? (
        <div className="p-3">
          <p className="text-sm text-texto-apagado">Se archivará: sale de la lista pero se conserva.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onArchive}
              className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
            >
              Archivar
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : mode === 'confirm-hecha' ? (
        <div className="p-3">
          <p className="text-sm text-texto-apagado">
            Se marcará como hecha: sale de la lista y se archiva. Se puede volver atrás desde "Ver archivadas".
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onSetStatus('hecha')}
              className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)]"
            >
              Marcar como hecha
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 p-3">
            <p className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-lectura ${meta.textClass}`}>
              {idea.text}
            </p>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label="Más acciones para esta idea"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-campo text-texto-tenue transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            >
              ⋯
            </button>
          </div>

          {menuOpen && (
            <div className="flex gap-2 border-y-[0.5px] border-separador bg-[var(--color-menu-fondo)] px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  startEdit()
                }}
                className="rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setMode('confirm-archive')
                }}
                className="rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
              >
                Archivar
              </button>
            </div>
          )}

          <div className="px-3 pb-3">
            <div className="inline-flex gap-1 rounded-lg border border-[var(--color-campo-borde)] bg-[var(--color-campo)] p-0.5 shadow-[var(--sombra-hundida)]">
              {STATUSES.map((s) => {
                const active = idea.status === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      if (active) return
                      if (s.value === 'hecha') {
                        setMode('confirm-hecha')
                      } else {
                        onSetStatus(s.value)
                      }
                    }}
                    aria-pressed={active}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-acento ${
                      active ? STATUS_META[s.value].pillActive : 'text-texto-apagado active:bg-separador'
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {!discarded && (
            <div
              className="border-t-[0.5px] border-separador px-3 py-2 text-sm font-medium text-ia-texto"
              style={{
                // "Dos tonos de --color-ia-suave": no hay un segundo token, así
                // que el segundo tono se deriva del mismo con color-mix() en
                // vez de declarar uno nuevo solo para esta banda.
                background:
                  'linear-gradient(to right, var(--color-ia-suave), color-mix(in srgb, var(--color-ia-suave) 55%, white))',
              }}
            >
              <button
                type="button"
                onClick={onAnalyze}
                disabled={analyzing || analyzeDisabled}
                className="w-full text-left transition-opacity disabled:opacity-50"
              >
                {analyzing ? 'Analizando…' : 'Analizar con IA'}
              </button>

              {analysisResult && 'text' in analysisResult && (
                <p className="mt-2 whitespace-pre-wrap text-sm font-normal text-texto-cuerpo">
                  {analysisResult.text}
                </p>
              )}

              {analysisResult && 'error' in analysisResult && (
                <div className="mt-2 text-sm font-normal text-fallado">
                  <p>{analysisResult.error}</p>
                  <button
                    type="button"
                    onClick={onAnalyze}
                    disabled={analyzing || analyzeDisabled}
                    className="mt-1 text-sm font-medium underline disabled:opacity-40"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
