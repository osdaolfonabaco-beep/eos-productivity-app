import { useState } from 'react'
import DayView from './components/DayView'
import HabitsView from './components/HabitsView'

type View = 'day' | 'habits'

function Tab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`py-3 text-sm focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-gray-800 ${
        active ? 'font-semibold text-gray-900' : 'font-normal text-gray-500'
      }`}
    >
      {label}
    </button>
  )
}

export default function App() {
  const [view, setView] = useState<View>('day')

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-gray-50">
      <div className="pb-24">{view === 'day' ? <DayView /> : <HabitsView />}</div>

      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-2">
          <Tab label="Hoy" active={view === 'day'} onClick={() => setView('day')} />
          <Tab
            label="Hábitos"
            active={view === 'habits'}
            onClick={() => setView('habits')}
          />
        </div>
      </nav>
    </div>
  )
}
