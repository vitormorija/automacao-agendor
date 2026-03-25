import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { LayoutDashboard, AlertTriangle, Bell, Settings } from 'lucide-react'
import Dashboard from './components/Dashboard'
import DealsList from './components/DealsList'
import NotificationHistory from './components/NotificationHistory'
import ConfigPanel from './components/ConfigPanel'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'deals', label: 'Negócios parados', icon: AlertTriangle },
  { id: 'history', label: 'Histórico', icon: Bell },
  { id: 'config', label: 'Configurações', icon: Settings },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bell size={16} className="text-white" />
              </div>
              <div>
                <span className="font-semibold text-gray-900 text-sm">Automação Agendor</span>
                <span className="text-xs text-gray-400 ml-2 hidden sm:inline">Monitor de negócios parados</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Nav tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'dashboard' && <Dashboard onTabChange={setTab} />}
        {tab === 'deals' && <DealsList />}
        {tab === 'history' && <NotificationHistory />}
        {tab === 'config' && <ConfigPanel />}
      </main>
    </div>
  )
}
