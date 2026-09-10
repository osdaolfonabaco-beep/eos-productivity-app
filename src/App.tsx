import { useState } from 'react'
import DayView from './components/DayView'
import DebtsView from './components/DebtsView'
import HabitsView from './components/HabitsView'
import WeekView from './components/WeekView'

type View = 'day' | 'week' | 'habits' | 'debts'

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
      className={`py-3 text-xs focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-gray-800 ${
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
      <div className="pb-24">
        {view === 'day' ? (
          <DayView />
        ) : view === 'week' ? (
          <WeekView />
        ) : view === 'habits' ? (
          <HabitsView />
        ) : (
          <DebtsView />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          <Tab label="Hoy" active={view === 'day'} onClick={() => setView('day')} />
          <Tab label="Semana" active={view === 'week'} onClick={() => setView('week')} />
          <Tab label="Hábitos" active={view === 'habits'} onClick={() => setView('habits')} />
          <Tab label="Deudas" active={view === 'debts'} onClick={() => setView('debts')} />
        </div>
      </nav>
    </div>
  )
}
