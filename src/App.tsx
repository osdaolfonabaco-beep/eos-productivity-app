import { useState, type ReactNode } from 'react'
import DebtsView from './components/DebtsView'
import HabitsView from './components/HabitsView'
import HomeView from './components/HomeView'
import IdeasView from './components/IdeasView'
import JournalView from './components/JournalView'
import LoginScreen from './components/LoginScreen'
import PlanView from './components/PlanView'
import SalaryView from './components/SalaryView'
import SectionNav from './components/SectionNav'
import SettingsView from './components/SettingsView'
import WeekView from './components/WeekView'
import { JournalLockProvider } from './journalLock'
import { useSession } from './useSession'

type Tab = 'hoy' | 'vida' | 'dinero' | 'ideas'
type VidaSub = 'habitos' | 'semana' | 'journal' | 'plan'
type DineroSub = 'deudas' | 'sueldo'

const TABS: { value: Tab; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'vida', label: 'Vida' },
  { value: 'dinero', label: 'Dinero' },
  { value: 'ideas', label: 'Ideas' },
]

const VIDA_ITEMS: { value: VidaSub; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'semana', label: 'Semana' },
  { value: 'journal', label: 'Journal' },
  { value: 'habitos', label: 'Hábitos' },
]

const DINERO_ITEMS: { value: DineroSub; label: string }[] = [
  { value: 'sueldo', label: 'Sueldo' },
  { value: 'deudas', label: 'Deudas' },
]

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z" />
    </svg>
  )
}

function BottomTab({
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
  const { session, loading } = useSession()
  const [tab, setTab] = useState<Tab>('hoy')
  const [vidaSub, setVidaSub] = useState<VidaSub>('semana')
  const [dineroSub, setDineroSub] = useState<DineroSub>('sueldo')
  const [settingsOpen, setSettingsOpen] = useState(false)

  function go(next: Tab) {
    setTab(next)
    setSettingsOpen(false)
  }

  let content: ReactNode
  if (settingsOpen) {
    content = (
      <SettingsView onClose={() => setSettingsOpen(false)} email={session?.user.email} />
    )
  } else if (tab === 'hoy') {
    content = <HomeView />
  } else if (tab === 'vida') {
    content = (
      <>
        <SectionNav items={VIDA_ITEMS} active={vidaSub} onChange={setVidaSub} />
        {vidaSub === 'habitos' ? (
          <HabitsView />
        ) : vidaSub === 'semana' ? (
          <WeekView />
        ) : vidaSub === 'plan' ? (
          <PlanView />
        ) : (
          <JournalView />
        )}
      </>
    )
  } else if (tab === 'dinero') {
    content = (
      <>
        <SectionNav items={DINERO_ITEMS} active={dineroSub} onChange={setDineroSub} />
        {dineroSub === 'sueldo' ? <SalaryView /> : <DebtsView />}
      </>
    )
  } else {
    content = <IdeasView />
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-gray-50">
      {loading ? (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-400">Productividad</p>
        </div>
      ) : !session ? (
        <LoginScreen />
      ) : (
        <JournalLockProvider active={tab === 'vida' && vidaSub === 'journal'}>
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

          <div className="pb-24">{content}</div>

          <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-4">
              {TABS.map((t) => (
                <BottomTab
                  key={t.value}
                  label={t.label}
                  active={!settingsOpen && tab === t.value}
                  onClick={() => go(t.value)}
                />
              ))}
            </div>
          </nav>
        </JournalLockProvider>
      )}
    </div>
  )
}
