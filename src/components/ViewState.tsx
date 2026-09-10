/** Estados compartidos de las vistas: cargando, error de carga, error de acción. */

/** Placeholder mientras llega la primera respuesta. */
export function Loading() {
  return <p className="px-4 py-10 text-center text-sm text-gray-400">Cargando…</p>
}

/** La carga inicial falló y no hay nada que mostrar. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-gray-500">No se pudo conectar.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
      >
        Reintentar
      </button>
    </div>
  )
}

/** Franja para un guardado que falló, con contenido ya en pantalla. */
export function ActionError({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar"
        className="shrink-0 font-semibold leading-none"
      >
        ×
      </button>
    </div>
  )
}
