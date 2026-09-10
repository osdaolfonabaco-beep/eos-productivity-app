import { useState } from 'react'
import DayView from './components/DayView'
import DebtsView from './components/DebtsView'
import HabitsView from './components/HabitsView'
import SettingsView from './components/SettingsView'
import WeekView from './components/WeekView'

type View = 'day' | 'week' | 'habits' | 'debts'

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z" />
    </svg>
  )
}

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
  const [settingsOpen, setSettingsOpen] = useState(false)

  function go(next: View) {
    setView(next)
    setSettingsOpen(false)
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-gray-50">
      <header className="flex h-11 items-center justify-end px-2">
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Ajustes"
          aria-pressed={settingsOpen}
          className={`rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-800 ${
            settingsOpen ? 'text-gray-800' : 'text-gray-400'
          }`}
        >
          <GearIcon />
        </button>
      </header>

      <div className="pb-24">
        {settingsOpen ? (
          <SettingsView onClose={() => setSettingsOpen(false)} />
        ) : view === 'day' ? (
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
          <Tab label="Hoy" active={!settingsOpen && view === 'day'} onClick={() => go('day')} />
          <Tab
            label="Semana"
            active={!settingsOpen && view === 'week'}
            onClick={() => go('week')}
          />
          <Tab
            label="Hábitos"
            active={!settingsOpen && view === 'habits'}
            onClick={() => go('habits')}
          />
          <Tab
            label="Deudas"
            active={!settingsOpen && view === 'debts'}
            onClick={() => go('debts')}
          />
        </div>
      </nav>
    </div>
  )
}
