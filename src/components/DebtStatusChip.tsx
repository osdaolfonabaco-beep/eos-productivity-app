import type { DebtStatus } from '../data'

/**
 * Glifo + palabra, para que "al día" y "en mora" se distingan sin el color.
 * "En mora" es una alerta real (campo que el usuario marca a mano en
 * `DebtForm`, no se deduce de ninguna fecha) y debe verse: usa
 * `--color-fallado`, el mismo tono que "no hecho" en el resto de la app.
 */
const META: Record<DebtStatus, { label: string; glyph: string; className: string }> = {
  'al-dia': { label: 'Al día', glyph: '✓', className: 'bg-hecho-suave text-hecho' },
  'en-mora': { label: 'En mora', glyph: '!', className: 'bg-fallado-suave text-fallado' },
}

export default function DebtStatusChip({ status }: { status: DebtStatus }) {
  const meta = META[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-pastilla px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <span aria-hidden="true" className="font-bold">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  )
}
