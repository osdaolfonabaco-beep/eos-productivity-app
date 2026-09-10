interface Item<T extends string> {
  value: T
  label: string
}

interface SectionNavProps<T extends string> {
  items: Item<T>[]
  active: T
  onChange: (value: T) => void
}

/**
 * Sub-navegación de una sección: una fila de pastillas, la activa rellena.
 * Estilo a propósito distinto de las pestañas de abajo (que usan peso), para
 * que se lea como "cambiar de vista dentro de esta sección".
 *
 * Solo tiene sentido con 2+ elementos; la sección decide si la muestra.
 */
export default function SectionNav<T extends string>({
  items,
  active,
  onChange,
}: SectionNavProps<T>) {
  return (
    <div className="px-4 pt-3">
      <div className="inline-flex gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
        {items.map((item) => {
          const isActive = item.value === active
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-800 ${
                isActive ? 'bg-gray-900 text-white' : 'text-gray-600'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
