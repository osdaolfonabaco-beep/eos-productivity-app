import type { DebtStatus } from '../data'

/** Glifo + palabra, para que "al día" y "en mora" se distingan sin el color. */
const META: Record<DebtStatus, { label: string; glyph: string; className: string }> = {
  'al-dia': { label: 'Al día', glyph: '✓', className: 'bg-green-50 text-green-700' },
  'en-mora': { label: 'En mora', glyph: '!', className: 'bg-rose-50 text-rose-700' },
}

export default function DebtStatusChip({ status }: { status: DebtStatus }) {
  const meta = META[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <span aria-hidden="true" className="font-bold">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  )
}
