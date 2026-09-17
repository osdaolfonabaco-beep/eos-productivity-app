import { useCallback, useState } from 'react'
import {
  acceptMentorProposal,
  autoCloseExpiredMentorProposals,
  closeMentorProposal,
  daysBetween,
  discardMentorProposal,
  getActiveMentorProposal,
  listRecentInactiveMentorProposals,
  toISODate,
  todayISO,
  type MentorProposal,
  type MentorProposalResult,
} from '../data'
import { useAsyncData } from '../useAsyncData'
import { ActionError, Loading } from './ViewState'

/** Flecha hacia abajo, que gira al expandir. Mismo icono que `MentorView`, duplicado a mano como el resto de iconos de la app. */
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

const RESULT_LABELS: Record<MentorProposalResult, string> = {
  funciono: 'Funcionó',
  'en-progreso': 'En progreso',
  descartada: 'Se descartó',
}

const CLOSE_OPTIONS: { value: MentorProposalResult; label: string }[] = [
  { value: 'funciono', label: 'Funcionó' },
  { value: 'en-progreso', label: 'En progreso' },
  { value: 'descartada', label: 'Lo descarté' },
]

/** `aceptadaEn` (timestamptz) → fecha local, para restar días de calendario con `daysBetween`. */
function daysSinceAccepted(aceptadaEn: string, today: string): number {
  return daysBetween(toISODate(new Date(aceptadaEn)), today)
}

/** Las tres pastillas de cierre, compartidas por el estado "aceptada" y el "vencida sin cerrar". */
function CloseOptions({
  busy,
  onClose,
  onCancel,
}: {
  busy: boolean
  onClose: (resultado: MentorProposalResult) => void
  onCancel?: () => void
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {CLOSE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onClose(opt.value)}
          disabled={busy}
          className="rounded-pastilla border border-borde px-3 py-1.5 text-sm font-medium text-texto-apagado transition-[transform,background-color] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador disabled:opacity-60"
        >
          {opt.label}
        </button>
      ))}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-pastilla px-3 py-1.5 text-sm font-medium text-texto-tenue disabled:opacity-60"
        >
          Cancelar
        </button>
      )}
    </div>
  )
}

/** Una propuesta del historial: texto + en qué quedó. */
function HistoryRow({ proposal }: { proposal: MentorProposal }) {
  const resultLabel = proposal.status === 'descartada' ? 'Descartada sin aceptar' : RESULT_LABELS[proposal.resultado!]
  return (
    <div className="border-t-[0.5px] border-separador px-3 py-2 first:border-t-0">
      <p className="text-meta text-texto-tenue">{resultLabel}</p>
      <p className="mt-0.5 text-sm text-texto-apagado">{proposal.contenido}</p>
    </div>
  )
}

/**
 * El plan de mejora del mentor: la propuesta que hace al final de cada
 * análisis semanal (`requestWeeklyAnalysis`, en `../data/analysis`) -- una
 * sola cosa sobre hábitos, tareas o rutinas, nunca dinero. Va en
 * `MentorView`, debajo del resumen acumulado.
 *
 * Autocontenido, igual que `MentorPurposeSection`/`MentorSummarySection`.
 * Al montar cierra sola cualquier propuesta aceptada y vencida hace más de
 * dos semanas (`autoCloseExpiredMentorProposals`) antes de leer nada --
 * así una propuesta olvidada nunca se queda bloqueando el índice único.
 */
export default function MentorProposalSection() {
  const today = todayISO()

  const fetcher = useCallback(async () => {
    await autoCloseExpiredMentorProposals()
    const [active, historial] = await Promise.all([
      getActiveMentorProposal(),
      listRecentInactiveMentorProposals(),
    ])
    return { active, historial }
  }, [])
  const { data, loading, error, reload } = useAsyncData(fetcher)

  const [closing, setClosing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, failMessage: string) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setClosing(false)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : failMessage)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading />
  // Un fallo de carga aquí no bloquea el resto de la pantalla, mismo
  // criterio que MentorPurposeSection/MentorSummarySection.
  if (error && !data) return null
  if (!data) return null

  const { active, historial } = data
  const isExpired = active?.status === 'aceptada' && active.venceEn !== null && active.venceEn < today
  // `aceptadaEn`/`venceEn` nunca son null cuando `status === 'aceptada'`: el
  // check de la base los exige juntos -- ver supabase/mentor-proposals.sql.
  const diasDesde = active?.aceptadaEn ? daysSinceAccepted(active.aceptadaEn, today) : null
  const diasParaVencer = active?.venceEn ? daysBetween(today, active.venceEn) : null

  return (
    <div className="px-4 pt-4">
      <h2 className="mb-2 text-etiqueta uppercase etiqueta-calido">Plan de mejora</h2>

      {actionError && (
        <div className="mb-2">
          <ActionError message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {!active ? (
        <p className="rounded-tarjeta border border-dashed border-borde px-4 py-6 text-center text-texto-apagado">
          El mentor propondrá una en el próximo análisis semanal.
        </p>
      ) : active.status === 'propuesta' ? (
        <div className="rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)]">
          <p className="text-lectura text-texto-cuerpo">{active.contenido}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void run(() => acceptMentorProposal(active.id), 'No se pudo aceptar.')}
              disabled={busy}
              className="rounded-campo bg-[image:var(--grad-secundario)] px-4 py-2 text-sm font-medium text-white shadow-[var(--sombra-acento)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:shadow-[var(--sombra-acento-toque)] disabled:bg-none disabled:bg-transparent disabled:text-texto-tenue disabled:shadow-none"
            >
              Aceptar
            </button>
            {/* Sin confirmación: no destruye nada, solo cambia de estado -- distinto del borrado real de MentorPurposeSection. */}
            <button
              type="button"
              onClick={() => void run(() => discardMentorProposal(active.id), 'No se pudo descartar.')}
              disabled={busy}
              className="rounded-campo border border-borde bg-[image:var(--grad-neutro)] px-4 py-2 text-sm font-medium text-texto-apagado transition-transform duration-[var(--dur-toque)] ease-toque active:scale-[0.96] disabled:opacity-60"
            >
              Descartar
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-tarjeta border bg-tarjeta p-3 shadow-[var(--sombra-tarjeta)] ${
            isExpired ? 'border-fallado' : 'border-borde'
          }`}
        >
          <p className="text-lectura text-texto-cuerpo">{active.contenido}</p>
          {diasDesde !== null && diasParaVencer !== null && (
            <p className="mt-1 text-meta text-texto-tenue">
              {diasDesde === 0 ? 'Aceptada hoy' : `Aceptada hace ${diasDesde} días`}
              {' · '}
              {isExpired ? `venció hace ${Math.abs(diasParaVencer)} días` : `vence en ${diasParaVencer} días`}
            </p>
          )}

          {isExpired ? (
            <>
              <p className="mt-2 text-sm font-medium text-fallado">¿Cómo fue?</p>
              <CloseOptions
                busy={busy}
                onClose={(resultado) =>
                  void run(() => closeMentorProposal(active.id, resultado), 'No se pudo cerrar.')
                }
              />
            </>
          ) : closing ? (
            <CloseOptions
              busy={busy}
              onClose={(resultado) =>
                void run(() => closeMentorProposal(active.id, resultado), 'No se pudo cerrar.')
              }
              onCancel={() => setClosing(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setClosing(true)}
              className="mt-2 rounded-pastilla bg-tarjeta px-3 py-1.5 text-sm font-medium text-texto-apagado shadow-[var(--sombra-pastilla)] transition-[transform,background-color,box-shadow] duration-[var(--dur-toque)] ease-toque active:scale-[0.96] active:bg-separador active:shadow-[var(--sombra-pastilla-toque)]"
            >
              ¿Cómo fue?
            </button>
          )}
        </div>
      )}

      {historial.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
            className="flex min-h-11 w-full items-center justify-between text-left text-sm text-texto-apagado"
          >
            <span>Propuestas anteriores ({historial.length})</span>
            <span
              aria-hidden="true"
              className={`text-texto-tenue transition-transform duration-[var(--dur-toque)] ease-toque ${
                historyOpen ? 'rotate-180' : ''
              }`}
            >
              <ChevronIcon />
            </span>
          </button>
          {historyOpen && (
            <div className="mt-1 overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-[var(--sombra-tarjeta)]">
              {historial.map((p) => (
                <HistoryRow key={p.id} proposal={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
